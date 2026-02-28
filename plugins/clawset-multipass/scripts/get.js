// Get detailed VM info for a single Multipass instance
// NOTE: This only returns machine-level info. App-specific status
// (node, openclaw, provisioning) comes from the agent app's status script.
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
    mounts: mounts
};
