// Mount a host folder into a Multipass instance
var instanceId = clawset.env("INSTANCE_ID");
var hostPath = clawset.env("HOST_PATH");
var guestPath = clawset.env("GUEST_PATH");

var dest = instanceId + ":" + guestPath;
var result = clawset.shell("multipass", ["mount", hostPath, dest]);

if (result.exitCode !== 0) {
    // Mount might already exist, log but don't fail
    clawset.log("Mount warning: " + result.stderr);
}

return { success: true };
