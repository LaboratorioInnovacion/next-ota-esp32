#!/usr/bin/env python3
"""Validate the dedicated runtime-only raw Compose env file without repair."""

import os
from pathlib import Path
import re
import stat
import sys
import secrets
import hmac


def open_shared(directory):
    path = Path(directory)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("Absolute shared path required")
    descriptor = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
            info = os.fstat(descriptor)
            if info.st_uid not in (0, os.geteuid()) or info.st_mode & 0o022:
                raise ValueError("Unsafe ancestor")
        if stat.S_IMODE(os.fstat(descriptor).st_mode) != 0o700:
            raise ValueError("Unsafe shared directory")
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def token_content(token):
    if not re.fullmatch(rb"[\x21-\x7e]+", token):
        raise ValueError("Invalid weather bearer credential")
    # Compose format: raw preserves dollars, hashes, quotes and backslashes.
    return b"ESP32_AUTH_TOKEN=" + token + b"\n"


def read_auth(directory):
    descriptor = os.open("app-auth.env", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                         dir_fd=directory)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_uid != os.geteuid() or info.st_nlink != 1):
            raise ValueError("Unsafe app auth file")
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            content = stream.read()
        match = re.fullmatch(rb"ESP32_AUTH_TOKEN=([\x21-\x7e]+)\n", content)
        if not match or token_content(match[1]) != content:
            raise ValueError("Invalid app auth file")
        return content
    finally:
        os.close(descriptor)


def validate(directory):
    descriptor = open_shared(directory)
    try:
        read_auth(descriptor)
    finally:
        os.close(descriptor)


def provision(directory, token):
    """Publish once from stdin tooling; never rotate or repair existing files."""
    content = token_content(token)
    descriptor = open_shared(directory)
    temporary = None
    try:
        try:
            existing = read_auth(descriptor)
        except FileNotFoundError:
            existing = None
        if existing is not None:
            if not hmac.compare_digest(existing, content):
                raise ValueError("Existing credential differs; rotation not authorized")
            return False
        temporary = ".app-auth-pending-" + secrets.token_hex(16)
        pending = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                          0o600, dir_fd=descriptor)
        with os.fdopen(pending, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        # Hard-link publication is atomic and cannot replace a concurrent file.
        os.link(temporary, "app-auth.env", src_dir_fd=descriptor, dst_dir_fd=descriptor,
                follow_symlinks=False)
        os.unlink(temporary, dir_fd=descriptor)
        temporary = None
        os.fsync(descriptor)
        if not hmac.compare_digest(read_auth(descriptor), content):
            raise ValueError("Verification failed")
        return True
    finally:
        if temporary is not None:
            os.unlink(temporary, dir_fd=descriptor)
        os.close(descriptor)


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Expected shared directory")
        validate(sys.argv[1])
    except (OSError, ValueError):
        sys.exit("App auth validation failed; inspect permissions/recovery state")
