// Destroy a Multipass instance
var instanceId = clawset.env("INSTANCE_ID");
var result = clawset.shell("multipass", ["delete", instanceId, "--purge"]);
if (result.exitCode !== 0) {
    throw new Error("Failed to destroy instance: " + result.stderr);
}
return { success: true };
