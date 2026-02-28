// Stop a running Multipass instance
var instanceId = clawset.env("INSTANCE_ID");
var result = clawset.shell("multipass", ["stop", instanceId]);
if (result.exitCode !== 0) {
    throw new Error("Failed to stop instance: " + result.stderr);
}
return { success: true };
