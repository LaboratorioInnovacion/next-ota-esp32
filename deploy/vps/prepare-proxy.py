#!/usr/bin/env python3
"""Add only the dedicated Estaciones proxy network; never replace attachments."""
import json
import subprocess

NETWORK = "next-ota-esp32-vps_proxy"
PROJECT = "next-ota-esp32-vps"
OWNER = "org.estaciones.proxy-owner"
NPM = "nginx-proxy-manager"
EXISTING = "nginx-proxy-manager_proxy-net"


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True)


def inspect(kind, name):
    return json.loads(docker(kind, "inspect", name))[0]


def validate_network(network, npm_id):
    if not (
        network["Name"] == NETWORK
        and network["Driver"] == "bridge"
        and network["Scope"] == "local"
        and network["Internal"] is True
        and network.get("Labels", {}).get(OWNER) == PROJECT
        and not network.get("Options")
        and not network.get("EnableIPv6")
    ):
        raise ValueError("Unexpected dedicated proxy network identity")
    for container_id in network.get("Containers", {}):
        if container_id == npm_id:
            continue
        container = inspect("container", container_id)
        labels = container["Config"].get("Labels") or {}
        if not (
            labels.get("com.docker.compose.project") == PROJECT
            and labels.get("com.docker.compose.service") == "app"
        ):
            raise ValueError("Unexpected dedicated proxy network attachment")


def main():
    npm = inspect("container", NPM)
    before = npm["NetworkSettings"]["Networks"]
    if not (
        npm["Name"] == "/" + NPM
        and npm["State"]["Running"]
        and npm["Config"]["Image"].startswith("jc21/nginx-proxy-manager:")
        and EXISTING in before
        and PROJECT + "_database" not in before
    ):
        raise ValueError("Unexpected NPM identity or existing topology")
    # List first: an inspect/daemon failure must never be treated as absence.
    names = docker("network", "ls", "--format", "{{.Name}}").splitlines()
    if NETWORK not in names:
        docker("network", "create", "--driver", "bridge", "--internal",
               "--label", OWNER + "=" + PROJECT, NETWORK)
    network = inspect("network", NETWORK)
    validate_network(network, npm["Id"])
    if NETWORK not in before:
        docker("network", "connect", network["Id"], npm["Id"])
    after = inspect("container", NPM)["NetworkSettings"]["Networks"]
    if not all(after.get(name) == details for name, details in before.items()):
        raise ValueError("Existing NPM connections changed; stop without repair")
    if after[NETWORK]["NetworkID"] != network["Id"]:
        raise ValueError("Unexpected NPM proxy network identity")
    validate_network(inspect("network", NETWORK), npm["Id"])
    print("Dedicated Estaciones proxy network validated; existing NPM connections preserved")


if __name__ == "__main__":
    main()
