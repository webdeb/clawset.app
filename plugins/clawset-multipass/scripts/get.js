// Get detailed info for a single Multipass instance
var instanceId = clawset.env("INSTANCE_ID");
var result = clawset.shell("multipass", ["info", instanceId, "--format", "json"]);

if (result.exitCode !== 0) {
    clawset.log("multipass info failed: " + result.stderr);
    return null;
}

var data = JSON.parse(result.stdout);
var info = data.info && data.info[instanceId];

if (!info) {
    return null;
}

// Parse resources
var memory = null;
if (info.memory) {
    var memTotal = info.memory.total || 0;
    var memUsed = info.memory.used || 0;
    memory = Math.round(memUsed / 1024 / 1024) + " MB / " + Math.round(memTotal / 1024 / 1024) + " MB";
}

var cpus = null;
if (info.cpu_count) {
    cpus = String(info.cpu_count);
}

var storage = null;
if (info.disks && info.disks.sda1) {
    var diskTotal = parseInt(info.disks.sda1.total || "0");
    var diskUsed = parseInt(info.disks.sda1.used || "0");
    storage = Math.round(diskUsed / 1024 / 1024 / 1024) + " GB / " + Math.round(diskTotal / 1024 / 1024 / 1024) + " GB";
}

// Parse mounts
var mounts = {};
if (info.mounts) {
    for (var mountPoint in info.mounts) {
        mounts[mountPoint] = info.mounts[mountPoint].source_path || "";
    }
}

var ip = "";
if (info.ipv4 && info.ipv4.length > 0) {
    ip = info.ipv4[0];
}

// Check node/openclaw/provisioning status inside the VM
var innerResult = clawset.shell("multipass", [
    "exec", instanceId, "--", "bash", "-ic",
    "source ~/.bashrc; echo '===NODE==='; node -v || echo 'NOT_FOUND'; echo '===OPENCLAW_VER==='; openclaw --version || echo 'NOT_FOUND'; echo '===PROVISIONING==='; if [ -f /tmp/provisioning ]; then echo 'YES'; else echo 'NO'; fi"
]);

var nodeInstalled = null;
var openclawInstalled = false;
var isProvisioning = false;

if (innerResult.exitCode === 0) {
    var lines = innerResult.stdout.split("\n");
    var section = "";
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line === "===NODE===") { section = "node"; continue; }
        if (line === "===OPENCLAW_VER===") { section = "openclaw"; continue; }
        if (line === "===PROVISIONING===") { section = "provisioning"; continue; }

        if (section === "node" && line !== "NOT_FOUND" && line !== "") {
            nodeInstalled = line;
        }
        if (section === "openclaw" && line !== "NOT_FOUND" && line !== "") {
            openclawInstalled = true;
        }
        if (section === "provisioning") {
            isProvisioning = (line === "YES");
        }
    }
}

return {
    id: instanceId,
    name: instanceId,
    status: info.state || "Unknown",
    ip: ip,
    provider: "multipass",
    meta: {
        os: info.image_release || "Ubuntu"
    },
    resources: {
        cpus: cpus,
        memory: memory,
        storage: storage
    },
    mounts: mounts,
    node_installed: nodeInstalled,
    openclaw_installed: openclawInstalled,
    is_provisioning: isProvisioning
};
