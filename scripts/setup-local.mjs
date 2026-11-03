import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../.env', import.meta.url);
let contents = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
contents = contents
  .replace('replace_with_database_password', randomBytes(24).toString('hex'))
  .replace('replace_with_mysql_root_password', randomBytes(24).toString('hex'))
  .replace('replace_with_random_secret_at_least_32_characters', randomBytes(48).toString('hex'))
  .replace('replace_with_a_strong_admin_password', randomBytes(18).toString('base64url'))
  .replace(/^SMTP_HOST=.*$/m, 'SMTP_HOST=')
  .replace(/^SMTP_USER=.*$/m, 'SMTP_USER=')
  .replace(/^SMTP_PASS=.*$/m, 'SMTP_PASS=');
try {
  await writeFile(target, contents, { flag: 'wx' });
  console.info('Created .env with random local credentials. Review it before starting.');
  console.info('Create the MySQL database and user using LOCAL_DEVELOPMENT.md.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.info('.env already exists; your configuration was preserved.');
}
