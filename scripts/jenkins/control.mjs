import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateConfig } from '../supabase/check.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const command = process.argv[2] || 'inspect';
const job = process.argv[3] || 'reservasi-pipeline';
let config;
try { config = JSON.parse(readFileSync(path.join(root, '.jenkins-auth.local.json'), 'utf8')); }
catch { console.error('Create a valid .jenkins-auth.local.json; token contents are never printed.'); process.exit(1); }
const base = new URL(config.url);
if (base.origin !== 'http://localhost:8080' || base.pathname !== '/' || base.username || base.password || base.search || base.hash) {
  throw new Error('Only http://localhost:8080 is accepted by this local Jenkins helper.');
}
if (!config.username || !config.token || config.token.includes('tempel-token')) throw new Error('Configure a valid local Jenkins API token file.');
const auth = `Basic ${Buffer.from(`${config.username}:${config.token}`).toString('base64')}`;
const jobPath = job.split('/').map((part) => `/job/${encodeURIComponent(part)}`).join('');
const reportDir = path.join(root, 'reports', 'jenkins');
mkdirSync(reportDir, { recursive: true });
async function request(route, options = {}) {
  const response = await fetch(new URL(route, base), {
    ...options, headers: { Authorization: auth, ...options.headers },
    redirect: 'manual', signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok && response.status !== 302) throw new Error(`Jenkins HTTP ${response.status}; route=${route.split('?')[0]}`);
  return response;
}
const xmlEscape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

async function publicConfiguration() {
  const prior = await (await request('/job/reservasi-pipeline/lastSuccessfulBuild/api/json?tree=actions[parameters[name,value]]')).json();
  const parameters = prior.actions.flatMap((action) => action.parameters || []);
  const values = Object.fromEntries(parameters.filter((p) => ['SUPABASE_URL', 'SUPABASE_PUBLIC_KEY'].includes(p.name)).map((p) => [p.name, p.value]));
  validateConfig({ VITE_SUPABASE_URL: values.SUPABASE_URL, VITE_SUPABASE_ANON_KEY: values.SUPABASE_PUBLIC_KEY });
  return values;
}

try {
  if (command === 'inspect') {
    const data = await (await request('/api/json?tree=jobs[name,_class,lastBuild[number,result]],mode,nodeDescription')).json();
    const plugins = await (await request('/pluginManager/api/json?tree=plugins[shortName,active,version]')).json();
    console.log(JSON.stringify({ controller: data, plugins: plugins.plugins.filter((p) => ['github-branch-source', 'workflow-multibranch', 'credentials', 'cloudbees-folder'].includes(p.shortName)) }, null, 2));
  } else if (command === 'validate') {
    for (const name of ['Jenkinsfile.dev', 'Jenkinsfile.security-proof', 'Jenkinsfile.container']) {
      const form = new URLSearchParams({ jenkinsfile: readFileSync(path.join(root, name), 'utf8') });
      const result = await (await request('/pipeline-model-converter/validate', { method: 'POST', body: form })).text();
      console.log(`${name}: ${result.trim()}`);
      if (!result.includes('successfully validated')) process.exitCode = 1;
    }
  } else if (['create-snapshot', 'update-snapshot'].includes(command)) {
    if (!/^reservasi-local-[a-z0-9-]+$/.test(job)) throw new Error('Snapshot jobs must use the reservasi-local- prefix.');
    const mode = process.argv[4];
    if (!['validation', 'proof'].includes(mode)) throw new Error('Expected validation or proof snapshot.');
    const paths = ['.gitignore', 'CI_DEVELOPMENT.md', 'CI_SECURITY_PLAN.md', 'CI_PR_DAST.md', 'Jenkinsfile.dev', 'Jenkinsfile.security-proof', 'package.json',
      'scripts/ci/proof-fixture.mjs', 'scripts/dast/setup-zap.ps1', 'scripts/dast/staging.mjs', 'scripts/dast/run.mjs', 'scripts/dast/run.test.mjs',
      'scripts/jenkins/control.mjs', 'scripts/jenkins/multibranch.xml',
      '.dockerignore', 'package-lock.json', 'docker-compose.yml', 'docker-compose.staging.yml', 'docker-compose.prod.yml',
      'frontend/Dockerfile', 'frontend/nginx.conf', 'frontend/nginx-main.conf', 'Jenkinsfile.container',
      'scripts/infra/setup-trivy.ps1', 'scripts/infra/scan.mjs', 'scripts/infra/scan.test.mjs', 'scripts/infra/baseline.mjs',
      'scripts/ops/collector.mjs', 'scripts/ops/releases.mjs', 'scripts/ops/monitor.mjs', 'scripts/ops/demo.mjs',
      'scripts/ops/security.test.mjs', 'scripts/ops/serve.mjs', 'scripts/ops/deploy.mjs',
      'observability/prometheus.yml', 'observability/alerts.yml'];
    const files = paths.map((name) => ({ name, bytes: readFileSync(path.join(root, name)) }));
    const digest = createHash('sha256');
    for (const file of files) digest.update(file.name + '\0').update(file.bytes).update('\0');
    const sourceHash = digest.digest('hex');
    // JVM string constants are limited to 65535 bytes; lockfiles exceed that.
    const writes = files.map((file) => {
      const chunks = file.bytes.toString('base64').match(/.{1,30000}/g) || [''];
      const encoded = '[' + chunks.map((chunk) => `'${chunk}'`).join(',') + "].join('')";
      return `writeFile file: '${file.name}', text: ${encoded}, encoding: 'Base64'`;
    }).join('\n');
    const scriptPath = mode === 'proof' ? 'Jenkinsfile.security-proof' : 'Jenkinsfile.dev';
    let script = readFileSync(path.join(root, scriptPath), 'utf8');
    const cache = path.join(root, '.tools', 'zap', 'ZAP_2.17.0_Crossplatform.zip').replaceAll('\\', '/').replaceAll("'", "\\'");
    const trivyCache = path.join(root, '.tools', 'trivy', 'trivy_0.76.2_windows-64bit.zip').replaceAll('\\', '/').replaceAll("'", "\\'");
    const checkout = `git branch: 'ilyas', url: 'https://github.com/Z0J0-hub/Booking_Ruangan-Lab.git'\n${writes}\nscript { env.CI_SOURCE_DIGEST = '${sourceHash}'; env.ZAP_ARCHIVE_CACHE = '${cache}'; env.TRIVY_ARCHIVE_CACHE = '${trivyCache}'; currentBuild.description = 'Local snapshot ${sourceHash}' }`;
    script = script.replace('checkout scm', checkout);
    let properties = '';
    if (mode === 'validation') {
      const values = await publicConfiguration();
      properties = `<hudson.model.ParametersDefinitionProperty><parameterDefinitions>
<hudson.model.StringParameterDefinition><name>SUPABASE_URL</name><defaultValue>${xmlEscape(values.SUPABASE_URL)}</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
<hudson.model.StringParameterDefinition><name>SUPABASE_PUBLIC_KEY</name><defaultValue>${xmlEscape(values.SUPABASE_PUBLIC_KEY)}</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
<hudson.model.BooleanParameterDefinition><name>RUN_STRIDE_DATABASE</name><defaultValue>false</defaultValue></hudson.model.BooleanParameterDefinition>
<hudson.model.StringParameterDefinition><name>STRIDE_DB_HOST</name><defaultValue></defaultValue></hudson.model.StringParameterDefinition>
</parameterDefinitions></hudson.model.ParametersDefinitionProperty>`;
      // A local snapshot is not an SCM-triggered job. Never advertise polling proof for it.
      script = script.replace("triggers { pollSCM('H/5 * * * *') }", '');
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><flow-definition><description>LOCAL SNAPSHOT ${sourceHash}; parent branch ilyas; not a PR or a committed revision.</description><keepDependencies>false</keepDependencies><properties>${properties}</properties><definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition"><script>${xmlEscape(script)}</script><sandbox>true</sandbox></definition><triggers/><disabled>false</disabled></flow-definition>`;
    const route = command === 'create-snapshot' ? `/createItem?name=${encodeURIComponent(job)}` : `${jobPath}/config.xml`;
    await request(route, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml });
    writeFileSync(path.join(reportDir, `${job}-source.json`), JSON.stringify({ job, sourceHash, mode, parentBranch: 'ilyas', paths, sourceMode: 'local-snapshot' }, null, 2) + '\n');
    console.log(`Prepared ${job}: ${mode}; LOCAL SNAPSHOT ${sourceHash}. No Git history changed; no build triggered.`);
  } else if (['create-proof', 'create-validation'].includes(command)) {
    const branch = process.argv[4] || 'ilyas';
    if (!/^[a-zA-Z0-9_./-]+$/.test(branch)) throw new Error('Invalid source branch.');
    const scriptPath = command === 'create-proof' ? 'Jenkinsfile.security-proof' : 'Jenkinsfile.dev';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow-definition><description>Security validation for reviewed source. Separate workspace; no deploy or database credentials.</description><keepDependencies>false</keepDependencies><properties/><definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition"><scm class="hudson.plugins.git.GitSCM"><configVersion>2</configVersion><userRemoteConfigs><hudson.plugins.git.UserRemoteConfig><url>https://github.com/Z0J0-hub/Booking_Ruangan-Lab.git</url></hudson.plugins.git.UserRemoteConfig></userRemoteConfigs><branches><hudson.plugins.git.BranchSpec><name>*/${xmlEscape(branch)}</name></hudson.plugins.git.BranchSpec></branches><doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations><submoduleCfg class="empty-list"/><extensions/></scm><scriptPath>${scriptPath}</scriptPath><lightweight>true</lightweight></definition><triggers/><disabled>false</disabled></flow-definition>`;
    await request(`/createItem?name=${encodeURIComponent(job)}`, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml });
    console.log(`Created separate validation job: ${job}. Script=${scriptPath}; source branch=${branch}. No build triggered.`);
  } else if (command === 'enable-polling') {
    if (job !== 'reservasi-pipeline') throw new Error('Polling helper only changes the existing trusted reservasi-pipeline job.');
    const before = await (await request(`${jobPath}/config.xml`)).text();
    if (!before.includes('CpsScmFlowDefinition') || !before.includes('<name>*/ilyas</name>')) throw new Error('Expected the reviewed ilyas SCM job.');
    if (before.includes('PipelineTriggersJobProperty')) throw new Error('Existing triggers found; refusing to overwrite them.');
    const property = '<org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty><triggers><hudson.triggers.SCMTrigger><spec>H/5 * * * *</spec><ignorePostCommitHooks>false</ignorePostCommitHooks></hudson.triggers.SCMTrigger></triggers></org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>';
    const after = before.replace('<properties>', `<properties>${property}`);
    if (after === before) throw new Error('Cannot locate job properties.');
    writeFileSync(path.join(root, '.jenkins-config-backup.local.json'), JSON.stringify({ job, xml: before }));
    await request(`${jobPath}/config.xml`, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: after });
    const verified = await (await request(`${jobPath}/config.xml`)).text();
    if (!verified.includes('hudson.triggers.SCMTrigger') || !verified.includes('H/5 * * * *')) throw new Error('Polling configuration verification failed.');
    const evidence = { job, branch: 'ilyas', polling: 'H/5 * * * *', configured: true, eventBuildVerified: false };
    writeFileSync(path.join(reportDir, 'polling.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence));
  } else if (command === 'prepare-multibranch') {
    const credentialId = process.argv[4] || '';
    const xml = readFileSync(path.join(root, 'scripts', 'jenkins', 'multibranch.xml'), 'utf8').replace('__GITHUB_CREDENTIALS_ID__', xmlEscape(credentialId));
    await request(`/createItem?name=${encodeURIComponent(job)}`, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml });
    console.log(`Created disabled multibranch job ${job}. Verify isolated agent, public Supabase configuration, and GitHub status credential before enabling.`);
  } else if (command === 'activate-pr') {
    const revision = process.argv[4];
    if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('Provide the exact reviewed scanner commit SHA.');
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
    const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (head.status !== 0 || head.stdout.trim() !== revision || dirty.status !== 0 || dirty.stdout.trim()) throw new Error('Commit and review local changes before activating the trusted PR scanner.');
    const before = await (await request('/job/reservasi-pipeline/config.xml')).text();
    if (!before.includes('CpsScmFlowDefinition') || !before.includes('https://github.com/Z0J0-hub/Booking_Ruangan-Lab.git') || !before.includes('<scriptPath>Jenkinsfile.dev</scriptPath>')) throw new Error('Unexpected main SCM configuration.');
    const after = before.replace(/(<hudson\.plugins\.git\.BranchSpec>\s*<name>)[^<]+(<\/name>\s*<\/hudson\.plugins\.git\.BranchSpec>)/, (_, prefix, suffix) => prefix + revision + suffix)
      .replace('<lightweight>true</lightweight>', '<lightweight>false</lightweight>');
    if (after === before && !before.includes(`<name>${revision}</name>`)) throw new Error('Cannot identify SCM revision.');
    const backup = path.join(root, '.runtime', 'jenkins-pr-activation'); mkdirSync(backup, { recursive: true });
    writeFileSync(path.join(backup, 'before.xml'), before);
    await request('/job/reservasi-pipeline/config.xml', { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: after });
    const verify = await (await request('/job/reservasi-pipeline/config.xml')).text();
    if (!verify.includes(`<name>${revision}</name>`) || verify.includes('<lightweight>true</lightweight>')) throw new Error('Trusted revision/full checkout not confirmed.');
    writeFileSync(path.join(reportDir, 'pr-activation.json'), JSON.stringify({ job: 'reservasi-pipeline', trustedScannerRevision: revision,
      target: 'development', sourcePolicy: 'any branch in the same repository', mode: 'PR merge SAST and lockfile dependency audit', pollingMinutes: 5 }, null, 2) + '\n');
    console.log(`Trusted PR scanner pinned to ${revision}. Run one full/manual build to register the timer and PR parameters.`);
  } else if (command === 'build-pr') {
    if (job !== 'reservasi-pipeline') throw new Error('Use the main pipeline for PR scans.');
    const number = process.argv[4] || '';
    if (number && !/^[1-9][0-9]*$/.test(number)) throw new Error('Invalid PR number.');
    const values = await publicConfiguration();
    const body = new URLSearchParams({ ...values, PILIH_PEMERIKSAAN: 'Periksa PR menuju development', NOMOR_PR: number, PERIKSA_ULANG_PR: 'true' });
    const response = await request(`${jobPath}/buildWithParameters`, { method: 'POST', body });
    console.log(`PR check queued: ${response.headers.get('location') || 'check queue'}`);
  } else if (command === 'update-build-form') {
    if (job !== 'reservasi-pipeline') throw new Error('Use the main pipeline.');
    const before = await (await request(`${jobPath}/config.xml`)).text();
    const revision = before.match(/<hudson\.plugins\.git\.BranchSpec>\s*<name>([a-f0-9]{40})<\/name>/)?.[1];
    if (!revision || !before.includes('<scriptPath>Jenkinsfile.dev</scriptPath>')) throw new Error('Expected a pinned Jenkinsfile.dev job.');
    const values = await publicConfiguration();
    const choices = ['Periksa PR menuju development', 'Periksa kode branch ilyas terbaru', 'Coba alat pendeteksi: contoh masalah OWASP'];
    const stringParameter = (name, value, description) => `<hudson.model.StringParameterDefinition><name>${name}</name><description>${xmlEscape(description)}</description><defaultValue>${xmlEscape(value)}</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>`;
    const property = `<hudson.model.ParametersDefinitionProperty><parameterDefinitions>
<hudson.model.ChoiceParameterDefinition><name>PILIH_PEMERIKSAAN</name><description>${xmlEscape('PR: periksa kode (SAST) dan kerentanan paket pendukung pada gabungan PR dengan development. Branch ilyas terbaru: ambil kode terbaru yang sudah di-push ke ilyas saat tahap pengambilan kode; jalankan pemeriksaan, build, dan uji lokal. Perubahan yang belum di-push tidak ikut. Percobaan OWASP: hanya contoh masalah untuk mencoba alat, bukan aplikasi. Tidak deploy produksi.')}</description><choices class="java.util.Arrays$ArrayList"><a class="string-array">${choices.map(c => `<string>${xmlEscape(c)}</string>`).join('')}</a></choices></hudson.model.ChoiceParameterDefinition>
${stringParameter('NOMOR_PR', '', 'Hanya untuk Periksa PR. Isi nomor PR terbuka yang tujuannya development, dari branch mana pun dalam repo yang sama; kosong = cari otomatis. PR ke main belum didukung.')}
<hudson.model.BooleanParameterDefinition><name>PERIKSA_ULANG_PR</name><description>Hanya untuk Periksa PR manual: periksa lagi meskipun kodenya belum berubah. Jadwal otomatis hanya memeriksa perubahan baru.</description><defaultValue>true</defaultValue></hudson.model.BooleanParameterDefinition>
${stringParameter('SUPABASE_URL', values.SUPABASE_URL, 'Pengaturan aplikasi tersimpan. Biarkan nilainya; dipakai saat memeriksa kode branch ilyas terbaru.')}
${stringParameter('SUPABASE_PUBLIC_KEY', values.SUPABASE_PUBLIC_KEY, 'Kunci publik aplikasi tersimpan. Biarkan nilainya; jangan isi password atau kunci rahasia.')}
</parameterDefinitions></hudson.model.ParametersDefinitionProperty>`;
    const after = before.replace(/<hudson\.model\.ParametersDefinitionProperty>[\s\S]*?<\/hudson\.model\.ParametersDefinitionProperty>/, property)
      .replace(/<description>[\s\S]*?<\/description>/, `<description>${xmlEscape('Periksa PR menuju development dari branch mana pun dalam repo tim, kode branch ilyas terbaru dari GitHub, atau percobaan alat dengan contoh OWASP. Nomor versi kode tercantum pada build dan laporan reports/source. Tidak melakukan merge atau deploy produksi.')}</description>`);
    if (after === before) throw new Error('Cannot locate parameter definitions.');
    const backup = path.join(root, '.runtime', 'jenkins-build-form'); mkdirSync(backup, { recursive: true });
    writeFileSync(path.join(backup, 'before.xml'), before);
    await request(`${jobPath}/config.xml`, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: after });
    const verified = await (await request(`${jobPath}/config.xml`)).text();
    if (!verified.includes('<name>PILIH_PEMERIKSAAN</name>') || verified.includes('<name>PROOF_GATE</name>') || verified.includes('<name>RUN_MODE</name>')) throw new Error('Build form verification failed.');
    console.log(`Build form updated: PR -> development; latest ilyas source fetched per branch build; pipeline definition pinned to ${revision}.`);
  } else if (command === 'configure-main') {
    const before = await (await request('/job/reservasi-pipeline/config.xml')).text();
    if (!before.includes('CpsScmFlowDefinition') || !before.includes('<scriptPath>Jenkinsfile.dev</scriptPath>') || !before.includes('<name>*/ilyas</name>')) {
      throw new Error('Expected reservasi-pipeline SCM job on ilyas / Jenkinsfile.dev.');
    }
    const values = await publicConfiguration(); let replaced = 0;
    const after = before.replace(/<hudson\.model\.StringParameterDefinition>[\s\S]*?<\/hudson\.model\.StringParameterDefinition>/g, (block) => {
      for (const [name, value] of Object.entries(values)) {
        if (!block.includes(`<name>${name}</name>`)) continue;
        replaced++;
        const field = `<defaultValue>${xmlEscape(value)}</defaultValue>`;
        return /<defaultValue(?:\/>|>)/.test(block)
          ? block.replace(/<defaultValue(?:\/>|>[\s\S]*?<\/defaultValue>)/, field)
          : block.replace('</hudson.model.StringParameterDefinition>', `${field}</hudson.model.StringParameterDefinition>`);
      }
      return block;
    });
    if (replaced !== 2) throw new Error('Cannot identify both public configuration parameters.');
    await request('/job/reservasi-pipeline/config.xml', { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: after });
    console.log('Main SCM configuration verified; public Supabase defaults restored for manual/polled builds. No secret values printed.');
  } else if (command === 'consolidate') {
    const names = ['reservasi-local-proof', 'reservasi-local-dast', 'reservasi-local-ops', 'reservasi-pr-security'];
    const backup = path.join(root, '.runtime', 'jenkins-before-consolidation'); mkdirSync(backup, { recursive: true });
    const index = await (await request('/api/json?tree=jobs[name]')).json();
    for (const name of ['reservasi-pipeline', ...names]) {
      if (!index.jobs.some((entry) => entry.name === name)) continue;
      const configXml = await (await request(`/job/${name}/config.xml`)).text();
      writeFileSync(path.join(backup, `${name}.xml`), configXml);
      const data = await (await request(`/job/${name}/api/json?tree=name,builds[number,result,url,building,artifacts[fileName,relativePath]]`)).json();
      writeFileSync(path.join(backup, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
    }
    // Whitelisted, reversible folder moves only. Do not delete jobs or build history.
    const script = `
import jenkins.model.Jenkins
import hudson.model.Items
import hudson.model.Item
import com.cloudbees.hudson.plugins.folder.Folder
def j = Jenkins.get()
j.checkPermission(Jenkins.ADMINISTER)
def names = ['reservasi-local-proof','reservasi-local-dast','reservasi-local-ops','reservasi-pr-security']
def existingFolder = j.getItem('arsip-reservasi')
if (existingFolder != null && !(existingFolder instanceof Folder)) { throw new IllegalStateException('Archive name is not a folder') }
def jobsRoot = new File(j.rootDir, 'jobs').canonicalFile.toPath()
names.each { name ->
    def item = j.getItem(name)
    if (item != null) {
        item.checkPermission(Item.CONFIGURE)
        item.checkPermission(Item.DELETE)
        if (!item.rootDir.canonicalFile.toPath().startsWith(jobsRoot)) { throw new IllegalStateException('Source outside Jenkins jobs') }
        if (item instanceof hudson.model.Job && item.builds.any { it.isBuilding() }) { throw new IllegalStateException('Archive job is building: ' + name) }
        if (j.queue.items.any { it.task.fullName == name }) { throw new IllegalStateException('Archive job is queued: ' + name) }
        if (existingFolder?.getItem(name) != null) { throw new IllegalStateException('Archive destination exists: ' + name) }
    }
}
def folder = existingFolder ?: j.createProject(Folder.class, 'arsip-reservasi')
folder.checkPermission(Item.CREATE)
if (!folder.rootDir.canonicalFile.toPath().startsWith(jobsRoot)) { throw new IllegalStateException('Destination outside Jenkins jobs') }
folder.setDisplayName('Arsip uji reservasi (nonaktif)')
folder.setDescription('Riwayat pengujian lama. Gunakan reservasi-pipeline untuk CI lengkap dan proof fail-fast.')
folder.save()
names.each { name ->
    def item = j.getItem(name)
    if (item != null) {
        item.setDisabled(true)
        item.save()
        Items.move(item, folder)
    }
    def archived = folder.getItem(name)
    if (archived != null) { println(archived.fullName + ': disabled=' + archived.isDisabled()) }
}
def main = j.getItem('reservasi-pipeline')
main.setDescription('Pipeline utama reservasi: ilyas -> PR development. PROOF_GATE=none untuk CI lengkap; secret/sast untuk uji fail-fast sintetis. Riwayat percobaan ada di arsip-reservasi.')
main.save()
println('Main pipeline: ' + main.fullName)
`;
    const response = await (await request('/scriptText', { method: 'POST', body: new URLSearchParams({ script }) })).text();
    if (!response.includes('Main pipeline: reservasi-pipeline')) throw new Error('CONSOLIDATION_NOT_CONFIRMED');
    const state = await (await request('/job/arsip-reservasi/api/json?tree=jobs[name,buildable,lastBuild[number,result]]')).json();
    if (state.jobs.length !== 4 || state.jobs.some((entry) => entry.buildable)) throw new Error('ARCHIVE_VERIFICATION_FAILED');
    writeFileSync(path.join(reportDir, 'consolidation.json'), JSON.stringify(state, null, 2) + '\n');
    console.log(response.trim());
  } else if (command === 'start') {
    const response = await request(`${jobPath}/build`, { method: 'POST' });
    console.log(`Queued: ${response.headers.get('location') || 'check job queue'}`);
  } else if (command === 'build-validation') {
    const values = await publicConfiguration();
    const body = new URLSearchParams({ ...values, PILIH_PEMERIKSAAN: 'Periksa kode branch ilyas terbaru', NOMOR_PR: '', PERIKSA_ULANG_PR: 'false' });
    const response = await request(`${jobPath}/buildWithParameters`, { method: 'POST', body });
    console.log(`Validation queued with existing public configuration: ${response.headers.get('location') || 'check job queue'}`);
  } else if (command === 'build-proof') {
    const gate = process.argv[4] || 'secret';
    if (!['secret', 'sast', 'owasp'].includes(gate)) throw new Error('Invalid proof gate.');
    if (job === 'reservasi-pipeline' && gate !== 'owasp') throw new Error('The main build form offers one detector demonstration: owasp.');
    // Parameters are registered on the first build; initialize with a normal build if needed.
    const values = job === 'reservasi-pipeline' ? await publicConfiguration() : {};
    const parameters = job === 'reservasi-pipeline' ? { PILIH_PEMERIKSAAN: 'Coba alat pendeteksi: contoh masalah OWASP', NOMOR_PR: '', PERIKSA_ULANG_PR: 'false' } : { RUN_MODE: 'full', PROOF_GATE: gate, RUN_STRIDE_DATABASE: 'false', STRIDE_DB_HOST: '' };
    const response = await request(`${jobPath}/buildWithParameters`, { method: 'POST', body: new URLSearchParams({ ...values, ...parameters }) });
    console.log(`Proof queued: ${response.headers.get('location') || 'check job queue'}`);
  } else if (command === 'automation-state') {
    const classic = await (await request('/job/reservasi-pipeline/config.xml')).text();
    const index = await (await request('/api/json?tree=jobs[name]')).json();
    const archived = index.jobs.some((entry) => entry.name === 'arsip-reservasi');
    const multibranchPath = archived ? '/job/arsip-reservasi/job/reservasi-pr-security' : '/job/reservasi-pr-security';
    const multibranch = await (await request(`${multibranchPath}/config.xml`)).text();
    const state = { classicJob: 'reservasi-pipeline', trustedBranch: 'ilyas',
      pollingConfigured: classic.includes('hudson.triggers.SCMTrigger') && classic.includes('H/5 * * * *'),
      multibranchJob: archived ? 'arsip-reservasi/reservasi-pr-security' : 'reservasi-pr-security', multibranchDisabled: multibranch.includes('<disabled>true</disabled>'),
      originPRDiscovery: multibranch.includes('OriginPullRequestDiscoveryTrait'),
      mergeRevision: /OriginPullRequestDiscoveryTrait>[\s\S]*?<strategyId>1<\/strategyId>/.test(multibranch),
      periodicDiscovery: multibranch.includes('<interval>900000</interval>'),
      prEventBuildVerified: false, requiredChecksVerified: false };
    writeFileSync(path.join(reportDir, 'automation-state.json'), JSON.stringify(state, null, 2) + '\n');
    console.log(JSON.stringify(state, null, 2));
  } else if (command === 'status') {
    const data = await (await request(`${jobPath}/api/json?tree=name,buildable,nextBuildNumber,builds[number,result,building,description,actions[lastBuiltRevision[SHA1]]]`)).json();
    console.log(JSON.stringify({ ...data, builds: data.builds.slice(0, 6).map((build) => ({ number: build.number, result: build.result,
      building: build.building, description: build.description, commit: build.actions.find((action) => action.lastBuiltRevision)?.lastBuiltRevision.SHA1 || null })) }, null, 2));
  } else if (command === 'scan-report') {
    const number = process.argv[4];
    const category = process.argv[5];
    if (!/^\d+$/.test(number || '') || !['audit', 'dast', 'secrets', 'sast', 'infra', 'image', 'ops', 'pr'].includes(category)) throw new Error('Provide exact build and scan category.');
    const data = await (await request(`${jobPath}/${number}/artifact/reports/${category}/summary.json`)).json();
    writeFileSync(path.join(reportDir, `${job.replaceAll('/', '-')}-${number}-${category}.json`), JSON.stringify(data, null, 2) + '\n');
    console.log(JSON.stringify(data, null, 2));
  } else if (command === 'tail') {
    const number = process.argv[4];
    if (!/^\d+$/.test(number || '')) throw new Error('Provide an exact build number.');
    const output = await (await request(`${jobPath}/${number}/consoleText`)).text();
    console.log(output.split('\n').slice(-65).join('\n').replaceAll(config.token, '[REDACTED]'));
  } else if (['evidence', 'verify-proof'].includes(command)) {
    const number = process.argv[4];
    if (!/^\d+$/.test(number || '')) throw new Error('Provide an exact build number.');
    const build = await (await request(`${jobPath}/${number}/api/json?tree=number,url,description,result,building,duration,actions[lastBuiltRevision[SHA1]],artifacts[fileName,relativePath]`)).json();
    const stagesResponse = await fetch(new URL(`${jobPath}/${number}/wfapi/describe`, base), { headers: { Authorization: auth }, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const stages = stagesResponse.ok ? (await stagesResponse.json()).stages : null;
    const evidence = { job, ...build, stages };
    if (command === 'verify-proof') {
      const gate = process.argv[5];
      if (!['secret', 'sast', 'owasp'].includes(gate)) throw new Error('Provide exact proof gate: secret, sast, or owasp.');
      if (job === 'reservasi-pipeline' && gate === 'owasp' && build.result === 'SUCCESS') {
        const demo = await (await request(`${jobPath}/${number}/artifact/reports/sast/hasil-percobaan.json`)).json();
        evidence.proof = { gate, ...demo, verified: !build.building && demo.passed === true && demo.kind === 'contoh-bukan-aplikasi' && demo.detectedCategories === 10 };
        if (!evidence.proof.verified) process.exitCode = 1;
      } else {
      const category = gate === 'secret' ? 'secrets' : 'sast';
      const scan = await (await request(`${jobPath}/${number}/artifact/reports/${category}/summary.json`)).json();
      const consoleText = await (await request(`${jobPath}/${number}/consoleText`)).text();
      evidence.proof = { gate, scanStatus: scan.status, scanExitCode: scan.exitCode, findings: scan.findings.length,
        nextStageSkipped: consoleText.includes(job === 'reservasi-pipeline'
          ? 'Stage "Archive Build" skipped due to earlier failure(s)'
          : 'Stage "Must Be Skipped" skipped due to earlier failure(s)'),
        scannerExitOne: consoleText.includes('script returned exit code 1') };
      evidence.proof.verified = build.result === 'FAILURE' && !build.building && scan.status === 'blocked' && scan.exitCode === 1 &&
        scan.findings.length > 0 && evidence.proof.nextStageSkipped && evidence.proof.scannerExitOne;
      if (gate === 'owasp') {
        const mapping = await (await request(`${jobPath}/${number}/artifact/reports/sast/coverage.json`)).json();
        evidence.proof.owaspCategoriesDetected = mapping.categories.filter((category) => category.findings > 0).length;
        evidence.proof.verified = evidence.proof.verified && mapping.standard === 'OWASP Top 10:2025' && evidence.proof.owaspCategoriesDetected === 10;
      }
      if (!evidence.proof.verified) process.exitCode = 1;
      }
    }
    const destination = path.join(reportDir, `${job.replaceAll('/', '-')}-${number}.json`);
    writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence, null, 2));
  } else { throw new Error('Unknown command.'); }
} catch (error) {
  // Never print auth configuration or HTTP response bodies.
  console.error(error.message.replaceAll(config.token, '[REDACTED]'));
  process.exitCode = 1;
}
