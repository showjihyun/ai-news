import fs from 'node:fs';
import path from 'node:path';

/**
 * .env 를 프로세스 환경으로 읽어들인다.
 *
 * 이게 없으면 .env 를 아무리 채워도 파이프라인은 못 본다. 셸에 export 하거나
 * `node --env-file` 을 매번 붙여야 하는데, 며칠에 걸쳐 반복 실행할 작업에서
 * 그런 요구는 그냥 사고로 이어진다(키를 안 읽은 채 수집만 하고 전부 실패).
 *
 * 의존성을 늘리지 않으려고 dotenv 를 쓰지 않는다. Node 20.12+ 의 loadEnvFile 을
 * 우선 쓰고, 없으면 직접 파싱한다.
 *
 * 이미 셸에 설정된 값은 덮어쓰지 않는다 — CI 에서는 Secret 이 환경으로 들어오고
 * .env 는 존재하지 않으므로, 로컬 파일이 CI 설정을 이기는 일이 생기면 안 된다.
 */
export function loadEnv(file = '.env'): void {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;

  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (p: string) => void })
    .loadEnvFile;
  if (typeof loadEnvFile === 'function') {
    try {
      loadEnvFile(full);
      return;
    } catch {
      /* 형식 문제면 아래 수동 파서로 넘어간다 */
    }
  }

  for (const raw of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // 따옴표로 감싼 값은 벗겨 준다. 주석은 따옴표 밖에 있을 때만 자른다.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
