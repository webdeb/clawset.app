// Check if Multipass is available on this host
var result = clawset.shell("multipass", ["version"]);
return result.exitCode === 0;
