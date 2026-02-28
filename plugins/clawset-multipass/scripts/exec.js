// Execute a command inside a Multipass instance
var instanceId = clawset.env("INSTANCE_ID");
var cmd = clawset.env("CMD");

var result = clawset.shell("multipass", [
    "exec", instanceId, "--", "bash", "-ic", cmd
]);

return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode
};
