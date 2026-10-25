import fs from 'node:fs';
import path from 'node:path';

// The broker alone receives this interface. Cloud stores can implement readSecret
// later using a workload identity; no cloud SDK or credential is present here.
export function localFileStore(filename, forbiddenRoots) {
  if (!path.isAbsolute(filename) || !Array.isArray(forbiddenRoots) || !forbiddenRoots.length)
    throw new Error('Credential source requires absolute path and forbidden roots');
  return Object.freeze({
    async readSecret() {
      let fd;
      try {
        const full = path.resolve(filename);
        if (fs.realpathSync(full) !== full) throw new Error();
        for (const root of forbiddenRoots) {
          const real = fs.realpathSync(root);
          if (full === real || full.startsWith(real + path.sep)) throw new Error();
        }
        const parent = fs.statSync(path.dirname(full));
        if ((parent.mode & 0o077) || parent.uid !== process.getuid()) throw new Error();
        fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const st = fs.fstatSync(fd);
        if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o777) !== 0o600 || st.uid !== process.getuid() || st.size > 8192) throw new Error();
        const secret = fs.readFileSync(fd, 'utf8').trim();
        if (!/^[A-Za-z0-9_./+=-]{16,8192}$/.test(secret)) throw new Error();
        return secret;
      } catch { throw new Error('Credential unavailable'); }
      finally { if (fd !== undefined) fs.closeSync(fd); }
    }
  });
}
