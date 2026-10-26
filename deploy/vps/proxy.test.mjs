import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("Executable proxy guard allows only additive, owned, isolated network changes", () => {
  const result = spawnSync("python3", ["-c", String.raw`
import copy, importlib.util, json
spec = importlib.util.spec_from_file_location("proxy", "deploy/vps/prepare-proxy.py")
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)
for scenario in ["new", "reuse", "connected", "foreign-label", "public-network",
                 "foreign-endpoint", "db-endpoint", "wrong-npm", "missing-egress",
                 "npm-on-db", "list-fails", "inspect-fails", "connect-fails",
                 "connection-changed", "wrong-driver", "custom-options"]:
    npm = {"Id": "npm-id", "Name": "/nginx-proxy-manager", "State": {"Running": True},
           "Config": {"Image": "jc21/nginx-proxy-manager:latest"},
           "NetworkSettings": {"Networks": {proxy.EXISTING: {"NetworkID": "existing-id"}}}}
    network = {"Id": "proxy-id", "Name": proxy.NETWORK, "Driver": "bridge", "Scope": "local",
               "Internal": True, "Labels": {proxy.OWNER: proxy.PROJECT}, "Options": {},
               "Containers": {}}
    if scenario == "foreign-label": network["Labels"] = {}
    if scenario == "public-network": network["Internal"] = False
    if scenario == "wrong-driver": network["Driver"] = "overlay"
    if scenario == "custom-options": network["Options"] = {"unexpected": "value"}
    if scenario in ["foreign-endpoint", "db-endpoint", "reuse"]:
        network["Containers"]["other-id"] = {}
    if scenario == "wrong-npm": npm["Config"]["Image"] = "unrelated:latest"
    if scenario == "missing-egress": npm["NetworkSettings"]["Networks"] = {}
    if scenario == "npm-on-db": npm["NetworkSettings"]["Networks"][proxy.PROJECT + "_database"] = {}
    if scenario == "connected":
        npm["NetworkSettings"]["Networks"][proxy.NETWORK] = {"NetworkID": "proxy-id"}
        network["Containers"]["npm-id"] = {}
    original = copy.deepcopy(npm["NetworkSettings"]["Networks"])
    mutations = []
    def docker(*args):
        if args[:2] == ("container", "inspect"):
            if args[2] in [proxy.NPM, "npm-id"]: return json.dumps([npm])
            service = "app" if scenario == "reuse" else "db"
            project = "other-project" if scenario == "foreign-endpoint" else proxy.PROJECT
            return json.dumps([{"Config": {"Labels": {
                "com.docker.compose.project": project, "com.docker.compose.service": service}}}])
        if args[:2] == ("network", "ls"):
            if scenario == "list-fails": raise RuntimeError("daemon unavailable")
            return "" if scenario == "new" and not mutations else proxy.NETWORK
        if args[:2] == ("network", "inspect"):
            if scenario == "inspect-fails": raise RuntimeError("inspect failed")
            return json.dumps([network])
        if args[:2] == ("network", "create"):
            assert args == ("network", "create", "--driver", "bridge", "--internal",
                            "--label", proxy.OWNER + "=" + proxy.PROJECT, proxy.NETWORK)
            mutations.append("create")
            return "proxy-id"
        if args[:2] == ("network", "connect"):
            assert args == ("network", "connect", "proxy-id", "npm-id")
            if scenario == "connect-fails": raise RuntimeError("connect failed")
            mutations.append("connect")
            npm["NetworkSettings"]["Networks"][proxy.NETWORK] = {"NetworkID": "proxy-id"}
            network["Containers"]["npm-id"] = {}
            if scenario == "connection-changed": npm["NetworkSettings"]["Networks"].pop(proxy.EXISTING)
            return ""
        raise AssertionError(args)
    proxy.docker = docker
    success = scenario in ["new", "reuse", "connected"]
    try:
        proxy.main()
        assert success, scenario
        assert all(npm["NetworkSettings"]["Networks"][key] == value for key, value in original.items())
        first = mutations.copy()
        proxy.main()
        assert mutations == first, "Redeploy must be idempotent"
        assert first == ({"new": ["create", "connect"], "reuse": ["connect"], "connected": []}[scenario])
    except (ValueError, RuntimeError):
        assert not success, scenario
        if scenario != "connection-changed": assert not mutations, scenario
print("16 proxy scenarios passed; no real Docker operations")
`], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    encoding: "utf8", timeout: 10000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /16 proxy scenarios passed/);
});
