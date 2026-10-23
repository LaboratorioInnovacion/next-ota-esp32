#!/usr/bin/env python3
"""Create isolated DB credentials once; never import or overwrite another env."""

import os
from pathlib import Path
import re
import secrets
import stat
import sys
import tempfile


def require_private(path, mode, directory=False):
    info = path.lstat()
    kind = stat.S_ISDIR if directory else stat.S_ISREG
    if (not kind(info.st_mode) or stat.S_IMODE(info.st_mode) != mode
            or info.st_uid != os.geteuid()):
        raise ValueError("Unsafe credential path permissions or ownership")


def prepare(directory):
    os.umask(0o077)
    env = directory / ".env"
    try:
        directory.mkdir(mode=0o700)
        created = True
    except FileExistsError:
        created = False
    require_private(directory, 0o700, directory=True)
    if not created:
        # A missing/partial file is a recovery incident, not permission to rotate.
        require_private(env, 0o600)
        content = env.read_bytes()
        match = re.fullmatch(
            rb"VPS_DB_ADMIN_PASSWORD=([0-9a-f]{64})\n"
            rb"VPS_APP_DB_PASSWORD=([0-9a-f]{64})\n", content)
        if not match or match[1] == match[2]:
            raise ValueError("Invalid isolated credential file; recovery required")
        return

    admin = secrets.token_hex(32)
    app = secrets.token_hex(32)
    while app == admin:
        app = secrets.token_hex(32)
    descriptor, temporary = tempfile.mkstemp(prefix=".env-pending-", dir=directory)
    try:
        with os.fdopen(descriptor, "w") as stream:
            stream.write(f"VPS_DB_ADMIN_PASSWORD={admin}\nVPS_APP_DB_PASSWORD={app}\n")
            stream.flush()
            os.fsync(stream.fileno())
        # Atomic publish with no replacement, including concurrent creators.
        os.link(temporary, env)
    finally:
        os.unlink(temporary)


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Expected dedicated shared directory")
        prepare(Path(sys.argv[1]))
    except (OSError, ValueError):
        # Never include file contents, generated values or exception payloads.
        sys.exit("Isolated credential preparation failed; inspect permissions/recovery state")
