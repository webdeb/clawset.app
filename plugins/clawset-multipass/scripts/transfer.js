// Transfer a file into a Multipass instance
var instanceId = clawset.env("INSTANCE_ID");
var localPath = clawset.env("LOCAL_PATH");
var remotePath = clawset.env("REMOTE_PATH");

var dest = instanceId + ":" + remotePath;
var result = clawset.shell("multipass", ["transfer", localPath, dest]);

if (result.exitCode !== 0) {
    throw new Error("Transfer failed: " + result.stderr);
}

return { success: true };
