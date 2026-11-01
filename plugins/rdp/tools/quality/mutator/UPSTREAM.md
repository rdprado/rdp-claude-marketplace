# Upstream

Copied from https://github.com/unclebob/mutator at commit `a5a0cb803b66e0cdb8bf471b3b08af701d424a41` (2026-10-21), license 0BSD.
This is our own code now: change it freely. To see what changed upstream since, compare from that commit.

## Our changes

- Windows: workers fall back to junctions (directories) and copies (files) when symlinks need a privilege; cleanup never follows a junction into the project (`workers.py`).
- Windows: a timed-out test run is killed with `taskkill /T` (no `os.killpg`) (`runner.py`).
