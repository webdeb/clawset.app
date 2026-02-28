// Start a stopped Multipass instance
var instanceId = clawset.env("INSTANCE_ID");
var result = clawset.shell("multipass", ["start", instanceId]);
if (result.exitCode !== 0) {
    throw new Error("Failed to start instance: " + result.stderr);
}
return { success: true };
