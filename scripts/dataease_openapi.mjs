#!/usr/bin/env node
import { createCipheriv, createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function usage() {
  return `DataEase ASK/OpenAPI helper

Usage:
  node dataease_openapi.mjs --config <file> [--allow-http] request <METHOD> <PATH> [@body.json|-]
  node dataease_openapi.mjs --config <file> [--allow-http] sql-dataset <create|update> @spec.json
  node dataease_openapi.mjs --config <file> [--allow-http] dashboard <inspect|update|publish> @spec.json
  node dataease_openapi.mjs --config <file> [--allow-http] chart <query|delete-fields> @spec.json

Notes:
  - PATH is relative to /de2api, for example /datasetTree/tree.
  - Dataset and dashboard mutations are dry-run by default; set dryRun to false for a live write.
  - Live SQL dataset updates require schemaContract.expectedFields and preserve unchanged field identities.
  - Live dashboard writes require explicit baseline/draft/view expectations; unacknowledged draft deltas are blocked.
  - Quote every DataEase ID in JSON. IDs can exceed JavaScript's safe integer range.
  - Day-only chart queries still send epoch milliseconds; use dateRange with an explicit utcOffset.
  - SQL dataset dry-run is the default; set \"dryRun\": false in the spec for a live write.
  - --allow-http must only be supplied after explicit plaintext HTTP authorization.
`;
}

function parseCli(argv) {
  const parsed = { configPath: null, allowHttp: false, rest: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--config') {
      parsed.configPath = argv[index + 1];
      index += 1;
    } else if (value === '--allow-http') {
      parsed.allowHttp = true;
    } else if (value === '--help' || value === '-h') {
      parsed.help = true;
    } else {
      parsed.rest.push(value);
    }
  }
  return parsed;
}

async function loadConfig(configPath, allowHttp) {
  if (!configPath) throw new Error('Missing --config <file>');
  const raw = await readFile(resolve(configPath), 'utf8');
  const accessKey = raw.match(/Access\s*Key\s*[：:]\s*(\S+)/i)?.[1];
  const secretKey = raw.match(/Secret\s*Key\s*[：:]\s*(\S+)/i)?.[1];
  const baseUrl = raw.match(/(?:查看\s*api|api\s*(?:地址|url)|地址|base\s*url)\s*[：:]\s*(https?:\/\/[^\s/#]+)/i)?.[1];
  if (!accessKey || !secretKey || !baseUrl) {
    throw new Error('Config must contain Access Key, Secret Key, and a DataEase base URL');
  }
  if (Buffer.byteLength(accessKey) !== 16) throw new Error('Access Key must be 16 bytes');
  if (![16, 24, 32].includes(Buffer.byteLength(secretKey))) {
    throw new Error('Secret Key must be 16, 24, or 32 bytes');
  }
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  if (new URL(normalizedBaseUrl).protocol === 'http:' && !allowHttp) {
    throw new Error('Plaintext HTTP refused. Re-run with --allow-http only after explicit user authorization');
  }
  return { accessKey, secretKey, baseUrl: normalizedBaseUrl };
}

function authHeaders(accessKey, secretKey) {
  const source = `${accessKey}|${randomUUID()}|${Date.now()}`;
  const cipher = createCipheriv(
    `aes-${Buffer.byteLength(secretKey) * 8}-cbc`,
    Buffer.from(secretKey, 'utf8'),
    Buffer.from(accessKey, 'utf8'),
  );
  const signature = Buffer.concat([cipher.update(source, 'utf8'), cipher.final()]).toString('base64');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ accessKey, signature })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const jwtSignature = createHmac('sha256', secretKey).update(signingInput).digest('base64url');
  return {
    Accept: 'application/json;charset=UTF-8',
    'Content-Type': 'application/json',
    accessKey,
    signature,
    'x-de-ask-token': `${signingInput}.${jwtSignature}`,
  };
}

async function apiRequest(config, path, body, method = 'POST', timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/de2api${path}`, {
      method: method.toUpperCase(),
      headers: authHeaders(config.accessKey, config.secretKey),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
    return { status: response.status, ok: response.ok, body: responseBody };
  } finally {
    clearTimeout(timeout);
  }
}

async function jsonFromArg(value) {
  if (!value || value === '-') return undefined;
  const text = value.startsWith('@')
    ? await readFile(resolve(value.slice(1)), 'utf8')
    : value;
  return JSON.parse(text);
}

async function specFromArg(value) {
  if (!value) throw new Error('Missing @spec.json');
  if (value.startsWith('@')) {
    const specPath = resolve(value.slice(1));
    return {
      spec: JSON.parse(await readFile(specPath, 'utf8')),
      baseDir: dirname(specPath),
      specPath,
    };
  }
  return { spec: JSON.parse(value), baseDir: process.cwd(), specPath: null };
}

function parseMaybeJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function exactId(value, label) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} was parsed as an unsafe number; quote it in JSON`);
    }
    value = String(value);
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`${label} must be a quoted decimal-string ID`);
  }
  return value;
}

function exactIdArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => exactId(item, `${label}[${index}]`));
}

function sortedStrings(value) {
  return [...value].map(String).sort();
}

function sameStringSet(a, b) {
  return JSON.stringify(sortedStrings(a)) === JSON.stringify(sortedStrings(b));
}

function stringDifference(left, right) {
  const rightSet = new Set(right.map(String));
  return left.map(String).filter((item) => !rightSet.has(item));
}

function isConnectionPoolError(result) {
  const text = typeof result?.body === 'string'
    ? result.body
    : JSON.stringify(result?.body || {});
  return /Cannot get a connection|pool error|Timeout waiting for idle object|borrowMaxWaitDuration/i.test(text);
}

function requireSuccess(result, phase) {
  if (!result.ok || result.body?.code !== 0) {
    const poolMessage = isConnectionPoolError(result)
      ? ' Datasource connection pool is exhausted; stop unchanged retries. Validation or an exact-config pool rebuild does not belong to this query and requires separate authorization.'
      : '';
    const error = new Error(`${phase} failed: HTTP ${result.status}.${poolMessage}`);
    if (poolMessage) error.code = 'DATAEASE_POOL_EXHAUSTED';
    error.result = result;
    throw error;
  }
  return result.body.data;
}

async function genericRequest(config, args) {
  const [method, path, bodyArg = '-'] = args;
  if (!method || !path) throw new Error('request requires METHOD and PATH');
  const body = await jsonFromArg(bodyArg);
  const result = await apiRequest(config, path, body, method, 120000);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok || (result.body && typeof result.body === 'object' && result.body.code !== 0)) {
    process.exitCode = 1;
  }
}

async function sqlDataset(config, args) {
  const [operation, specArg] = args;
  if (!['create', 'update'].includes(operation)) {
    throw new Error('sql-dataset operation must be create or update');
  }
  if (!specArg?.startsWith('@')) throw new Error('sql-dataset requires @spec.json');
  const specPath = resolve(specArg.slice(1));
  const spec = JSON.parse(await readFile(specPath, 'utf8'));
  if (operation === 'update' && !spec.id) throw new Error('Update spec requires id');
  for (const key of ['name', 'pid', 'datasourceId', 'sqlFile']) {
    if (spec[key] === undefined || spec[key] === null || spec[key] === '') {
      throw new Error(`Dataset spec requires ${key}`);
    }
  }

  const datasetId = operation === 'update' ? exactId(spec.id, 'dataset id') : null;
  const targetPid = exactId(spec.pid, 'dataset pid');
  const datasourceId = exactId(spec.datasourceId, 'datasourceId');
  const schemaContract = spec.schemaContract || {};
  if (schemaContract.expectedFields !== undefined) {
    if (!Array.isArray(schemaContract.expectedFields)
      || schemaContract.expectedFields.some((name) => typeof name !== 'string' || !name)) {
      throw new Error('schemaContract.expectedFields must be an array of non-empty field names');
    }
    if (new Set(schemaContract.expectedFields).size !== schemaContract.expectedFields.length) {
      throw new Error('schemaContract.expectedFields contains duplicates');
    }
  }

  const sqlPath = resolve(dirname(specPath), spec.sqlFile);
  const sql = await readFile(sqlPath, 'utf8');
  const encodedSql = Buffer.from(sql, 'utf8').toString('base64');
  let existingDataset = null;
  let existingNode = null;
  let oldCurrentDs = null;
  if (operation === 'update') {
    existingDataset = requireSuccess(await apiRequest(
      config,
      `/datasetTree/details/${datasetId}`,
      {},
      'POST',
      120000,
    ), 'dataset details');
    if (exactId(existingDataset.id, 'existing dataset id') !== datasetId
      || exactId(existingDataset.pid, 'existing dataset pid') !== targetPid) {
      throw new Error('Dataset identity or parent folder changed');
    }
    if (existingDataset.isCross === true || existingDataset.union?.length !== 1) {
      throw new Error('sql-dataset update supports one existing non-cross SQL node only');
    }
    existingNode = existingDataset.union[0];
    oldCurrentDs = structuredClone(existingNode?.currentDs || {});
    if (!oldCurrentDs.id || oldCurrentDs.type !== 'sql') {
      throw new Error('Existing dataset is not backed by a reusable SQL table node');
    }
  }

  const randomPart = BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 5)}`);
  const tableId = operation === 'update'
    ? exactId(oldCurrentDs.id, 'existing SQL table id')
    : ((BigInt(Date.now()) << 22n) | randomPart).toString();
  const tableName = spec.tableName || oldCurrentDs?.tableName || 'Custom SQL';
  const info = JSON.stringify({ table: tableName, sql: encodedSql });

  const fieldResult = await apiRequest(config, '/datasetData/tableField', {
    datasourceId,
    id: tableId,
    info,
    tableName,
    type: 'sql',
    isCross: false,
    sqlVariableDetails: '[]',
  });
  const sourceFields = requireSuccess(fieldResult, 'datasetData/tableField');
  if (!Array.isArray(sourceFields)) throw new Error('tableField did not return a field array');

  const sourceFieldNames = sourceFields.map((field) => field.originName);
  if (schemaContract.expectedFields
    && JSON.stringify(sourceFieldNames) !== JSON.stringify(schemaContract.expectedFields)) {
    throw new Error(`Field contract mismatch: ${JSON.stringify(sourceFieldNames)}`);
  }

  const oldFields = existingDataset?.allFields || [];
  const oldByName = new Map(oldFields.map((field) => [field.originName, field]));
  let nextFieldId = (BigInt(Date.now()) << 22n) | randomPart;
  const fields = sourceFields.map((field) => {
    const old = oldByName.get(field.originName);
    const internalName = `f_${createHash('md5')
      .update(`${tableId}_${field.originName}`)
      .digest('hex')
      .slice(8, 24)}`;
    return {
      ...(old || {}),
      ...field,
      id: old?.id ? String(old.id) : String(++nextFieldId),
      datasourceId,
      datasetTableId: tableId,
      datasetGroupId: datasetId,
      dataeaseName: old?.dataeaseName || internalName,
      fieldShortName: old?.fieldShortName || internalName,
      checked: old?.checked ?? true,
    };
  });
  const newByName = new Map(fields.map((field) => [field.originName, field]));
  const additions = sourceFieldNames.filter((name) => !oldByName.has(name));
  const removals = oldFields.map((field) => field.originName).filter((name) => !newByName.has(name));
  const typeChanges = sourceFields.flatMap((field) => {
    const old = oldByName.get(field.originName);
    if (!old) return [];
    const before = [old.type, old.deType, old.groupType].map((value) => String(value ?? '')).join('|');
    const after = [field.type, field.deType, field.groupType].map((value) => String(value ?? '')).join('|');
    return before === after ? [] : [{ field: field.originName, before, after }];
  });
  const oldDatasourceId = oldCurrentDs?.datasourceId ? String(oldCurrentDs.datasourceId) : datasourceId;
  const datasourceChanged = operation === 'update' && oldDatasourceId !== datasourceId;
  const breakingReasons = [];
  if (removals.length && schemaContract.allowRemovals !== true) {
    breakingReasons.push(`field removals not allowed: ${removals.join(', ')}`);
  }
  if (typeChanges.length && schemaContract.allowTypeChanges !== true) {
    breakingReasons.push(`field type changes not allowed: ${typeChanges.map((item) => item.field).join(', ')}`);
  }
  if (datasourceChanged && schemaContract.allowDatasourceChange !== true) {
    breakingReasons.push(`datasource change not allowed: ${oldDatasourceId} -> ${datasourceId}`);
  }

  const currentDs = {
    ...(oldCurrentDs || {}),
    id: tableId,
    name: oldCurrentDs?.name ?? null,
    tableName,
    datasourceId,
    datasetGroupId: oldCurrentDs?.datasetGroupId ?? null,
    type: 'sql',
    info,
    sqlVariableDetails: oldCurrentDs?.sqlVariableDetails || '[]',
    fields: null,
    lastUpdateTime: 0,
    status: oldCurrentDs?.status ?? null,
    isCross: false,
  };
  const union = operation === 'update'
    ? structuredClone(existingDataset.union)
    : [{
      currentDs,
      currentDsField: null,
      currentDsFields: fields,
      childrenDs: [],
      unionToParent: {
        unionType: 'left',
        unionFields: [],
        parentDs: null,
        currentDs: null,
        parentSQLObj: null,
        currentSQLObj: null,
      },
      allChildCount: 0,
    }];
  if (operation === 'update') {
    union[0].currentDs = currentDs;
    union[0].currentDsFields = structuredClone(fields);
  }
  const payload = {
    ...(operation === 'update' ? { id: datasetId } : {}),
    name: spec.name,
    pid: targetPid,
    nodeType: 'dataset',
    mode: existingDataset?.mode ?? 0,
    isCross: false,
    union,
    allFields: fields,
  };

  const audit = {
      dryRun: spec.dryRun !== false,
      operation,
      dataset: {
        id: datasetId,
        name: payload.name,
        pid: payload.pid,
        datasourceId,
        tableId,
        sqlPath,
        fieldCount: fields.length,
        fields: fields.map((field) => ({
          id: String(field.id),
          originName: field.originName,
          type: field.type,
          groupType: field.groupType,
          deType: field.deType,
          identityPreserved: oldByName.has(field.originName)
            && String(oldByName.get(field.originName).id) === String(field.id)
            && oldByName.get(field.originName).dataeaseName === field.dataeaseName,
        })),
        schemaDiff: { additions, removals, typeChanges, datasourceChanged },
        breakingReasons,
      },
    };
  if (spec.dryRun !== false) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    return;
  }

  if (operation === 'update' && !Array.isArray(schemaContract.expectedFields)) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    throw new Error('Live SQL dataset update requires schemaContract.expectedFields');
  }
  if (breakingReasons.length) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    throw new Error(`Breaking schema change blocked: ${breakingReasons.join('; ')}`);
  }

  const endpoint = operation === 'update' ? '/datasetTree/save' : '/datasetTree/create';
  const saveResult = await apiRequest(config, endpoint, payload, 'POST', 120000);
  requireSuccess(saveResult, `sql dataset ${operation}`);
  if (operation === 'update') {
    const saved = requireSuccess(await apiRequest(
      config,
      `/datasetTree/details/${datasetId}`,
      {},
      'POST',
      120000,
    ), 'saved dataset details');
    const savedInfo = parseMaybeJson(saved.union?.[0]?.currentDs?.info, {});
    const savedSql = Buffer.from(savedInfo.sql || '', 'base64').toString('utf8');
    const savedHash = createHash('sha256').update(savedSql).digest('hex');
    const expectedHash = createHash('sha256').update(sql).digest('hex');
    if (savedHash !== expectedHash) throw new Error('Saved SQL hash mismatch');
    const savedByName = new Map((saved.allFields || []).map((field) => [field.originName, field]));
    for (const field of fields) {
      const actual = savedByName.get(field.originName);
      if (!actual
        || String(actual.id) !== String(field.id)
        || actual.dataeaseName !== field.dataeaseName) {
        throw new Error(`Saved field identity mismatch for ${field.originName}`);
      }
    }
    process.stdout.write(`${JSON.stringify({
      ...audit,
      verified: { sqlSha256: savedHash, fieldCount: saved.allFields?.length || 0 },
    }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({ ...audit, phase: operation, saved: true }, null, 2)}\n`);
}

async function getDashboard(config, dashboardId, source = 'main') {
  return requireSuccess(await apiRequest(config, '/dataVisualization/findById', {
    id: exactId(dashboardId, 'dashboardId'),
    busiFlag: 'dashboard',
    resourceTable: source === 'main-edit' ? 'snapshot' : 'core',
    source,
    taskId: null,
  }, 'POST', 120000), `dashboard ${source} fetch`);
}

function dashboardActiveViewIds(dashboard) {
  const components = parseMaybeJson(dashboard.componentData, []);
  return components
    .filter((component) => component.component === 'UserView' && component.innerType !== 'VQuery')
    .map((component, index) => exactId(component.id, `componentData[${index}].id`));
}

function dashboardSummary(dashboard, source) {
  const components = parseMaybeJson(dashboard.componentData, []);
  const views = parseMaybeJson(dashboard.canvasViewInfo, {});
  const filters = components
    .filter((component) => component.innerType === 'VQuery' || Array.isArray(component.propValue))
    .flatMap((component) => (component.propValue || []).map((item) => ({
      componentId: exactId(component.id, 'query component id'),
      name: item.name,
      checkedFields: (item.checkedFields || []).map(String),
      checkedFieldsMap: item.checkedFieldsMap || {},
      defaultValueCheck: item.defaultValueCheck,
      defaultValue: item.defaultValue,
      displayType: item.displayType,
      timeGranularity: item.timeGranularity,
      timeGranularityMultiple: item.timeGranularityMultiple,
    })));
  return {
    source,
    id: exactId(dashboard.id, 'dashboard.id'),
    pid: exactId(dashboard.pid, 'dashboard.pid'),
    name: dashboard.name,
    status: dashboard.status,
    version: dashboard.version,
    viewIds: Object.keys(views),
    activeViewIds: dashboardActiveViewIds(dashboard),
    filters,
  };
}

function encodeCalculatedAxisFields(dashboard) {
  const copy = structuredClone(dashboard);
  const views = parseMaybeJson(copy.canvasViewInfo, {});
  const axisNames = [
    'xAxis', 'xAxisExt', 'yAxis', 'yAxisExt', 'extBubble',
    'extLabel', 'extStack', 'extTooltip', 'extColor',
  ];
  for (const view of Object.values(views)) {
    for (const axisName of axisNames) {
      for (const field of view?.[axisName] || []) {
        if (Number(field.extField) === 2 && typeof field.originName === 'string') {
          field.originName = Buffer.from(field.originName, 'utf8').toString('base64');
        }
      }
    }
  }
  copy.canvasViewInfo = views;
  return copy;
}

async function dashboardInspect(config, specArg) {
  const { spec } = await specFromArg(specArg);
  const dashboardId = exactId(spec.dashboardId, 'dashboardId');
  const source = spec.source || 'main';
  if (!['main', 'main-edit'].includes(source)) throw new Error('source must be main or main-edit');
  const dashboard = await getDashboard(config, dashboardId, source);
  process.stdout.write(`${JSON.stringify(dashboardSummary(dashboard, source), null, 2)}\n`);
}

async function dashboardUpdate(config, specArg) {
  const { spec, baseDir, specPath } = await specFromArg(specArg);
  const dashboardId = exactId(spec.dashboardId, 'dashboardId');
  let payload = spec.payload;
  let payloadPath = null;
  if (!payload && spec.payloadFile) {
    payloadPath = resolve(baseDir, spec.payloadFile);
    payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  }
  if (!payload || typeof payload !== 'object') throw new Error('dashboard update requires payload or payloadFile');
  if (exactId(payload.id, 'payload.id') !== dashboardId) throw new Error('payload.id does not match dashboardId');
  const [current, existingDraft] = await Promise.all([
    getDashboard(config, dashboardId, 'main'),
    getDashboard(config, dashboardId, 'main-edit'),
  ]);
  if (spec.expectedPid && exactId(current.pid, 'current.pid') !== exactId(spec.expectedPid, 'expectedPid')) {
    throw new Error('Dashboard parent folder changed');
  }
  const viewIds = Object.keys(parseMaybeJson(payload.canvasViewInfo, {}));
  const expectedViewIds = spec.expectedViewIds ? exactIdArray(spec.expectedViewIds, 'expectedViewIds') : null;
  const absentViewIds = spec.expectedAbsentViewIds ? exactIdArray(spec.expectedAbsentViewIds, 'expectedAbsentViewIds') : [];
  if (expectedViewIds && !sameStringSet(viewIds, expectedViewIds)) {
    throw new Error(`Payload view IDs mismatch: ${JSON.stringify(viewIds)}`);
  }
  for (const id of absentViewIds) {
    if (viewIds.includes(id)) throw new Error(`Payload still contains absent view ${id}`);
  }
  const mainActiveViewIds = dashboardActiveViewIds(current);
  const existingDraftActiveViewIds = dashboardActiveViewIds(existingDraft);
  const existingDraftChanged = !sameStringSet(mainActiveViewIds, existingDraftActiveViewIds);
  const expectedExistingDraftActiveViewIds = spec.expectedExistingDraftActiveViewIds
    ? exactIdArray(spec.expectedExistingDraftActiveViewIds, 'expectedExistingDraftActiveViewIds')
    : null;
  const existingDraftAcknowledged = !existingDraftChanged
    || (expectedExistingDraftActiveViewIds
      && sameStringSet(expectedExistingDraftActiveViewIds, existingDraftActiveViewIds));
  const missingLiveRequirements = [];
  if (!spec.expectedPid) missingLiveRequirements.push('expectedPid');
  if (!expectedViewIds) missingLiveRequirements.push('expectedViewIds');
  if (!existingDraftAcknowledged) missingLiveRequirements.push('expectedExistingDraftActiveViewIds');
  const audit = {
    command: 'dashboard update',
    dryRun: spec.dryRun !== false,
    specPath,
    payloadPath,
    current: dashboardSummary(current, 'main'),
    existingDraft: dashboardSummary(existingDraft, 'main-edit'),
    existingDraftDelta: {
      added: stringDifference(existingDraftActiveViewIds, mainActiveViewIds),
      removed: stringDifference(mainActiveViewIds, existingDraftActiveViewIds),
      acknowledged: Boolean(existingDraftAcknowledged),
    },
    desiredViewIds: viewIds,
    expectedAbsentViewIds: absentViewIds,
    missingLiveRequirements,
    wouldBlockLive: missingLiveRequirements.length > 0,
  };
  if (spec.dryRun !== false) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    return;
  }
  if (missingLiveRequirements.length) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    throw new Error(`Dashboard update blocked; missing or mismatched: ${missingLiveRequirements.join(', ')}`);
  }
  const requestPayload = spec.encodeCalculatedFields === false ? payload : encodeCalculatedAxisFields(payload);
  requireSuccess(await apiRequest(config, '/dataVisualization/updateCanvas', requestPayload, 'POST', 120000), 'dashboard updateCanvas');
  const draft = await getDashboard(config, dashboardId, 'main-edit');
  const draftViewIds = Object.keys(parseMaybeJson(draft.canvasViewInfo, {}));
  if (expectedViewIds && !sameStringSet(draftViewIds, expectedViewIds)) {
    throw new Error(`Draft view IDs mismatch after write: ${JSON.stringify(draftViewIds)}`);
  }
  for (const id of absentViewIds) {
    if (draftViewIds.includes(id)) throw new Error(`Draft still contains absent view ${id}`);
  }
  process.stdout.write(`${JSON.stringify({ ...audit, verifiedDraft: dashboardSummary(draft, 'main-edit') }, null, 2)}\n`);
}

async function dashboardPublish(config, specArg) {
  const { spec, specPath } = await specFromArg(specArg);
  const dashboardId = exactId(spec.dashboardId, 'dashboardId');
  const [draft, currentMain] = await Promise.all([
    getDashboard(config, dashboardId, 'main-edit'),
    getDashboard(config, dashboardId, 'main'),
  ]);
  const derivedActiveViewIds = dashboardActiveViewIds(draft);
  const activeViewIds = spec.activeViewIds
    ? exactIdArray(spec.activeViewIds, 'activeViewIds')
    : derivedActiveViewIds;
  if (!sameStringSet(activeViewIds, derivedActiveViewIds)) {
    throw new Error(`Requested activeViewIds differ from draft components: ${JSON.stringify(derivedActiveViewIds)}`);
  }
  const currentMainActiveViewIds = dashboardActiveViewIds(currentMain);
  const expectedMainActiveViewIds = spec.expectedMainActiveViewIds
    ? exactIdArray(spec.expectedMainActiveViewIds, 'expectedMainActiveViewIds')
    : null;
  const allowedAddedViewIds = spec.allowedAddedViewIds
    ? exactIdArray(spec.allowedAddedViewIds, 'allowedAddedViewIds')
    : [];
  const allowedRemovedViewIds = spec.allowedRemovedViewIds
    ? exactIdArray(spec.allowedRemovedViewIds, 'allowedRemovedViewIds')
    : [];
  const addedViewIds = stringDifference(activeViewIds, currentMainActiveViewIds);
  const removedViewIds = stringDifference(currentMainActiveViewIds, activeViewIds);
  const baselineMatches = expectedMainActiveViewIds
    ? sameStringSet(expectedMainActiveViewIds, currentMainActiveViewIds)
    : false;
  const declaredDeltaMatches = sameStringSet(addedViewIds, allowedAddedViewIds)
    && sameStringSet(removedViewIds, allowedRemovedViewIds);
  const missingLiveRequirements = [];
  if (!spec.activeViewIds) missingLiveRequirements.push('activeViewIds');
  if (!expectedMainActiveViewIds || !baselineMatches) {
    missingLiveRequirements.push('expectedMainActiveViewIds');
  }
  if (!declaredDeltaMatches) {
    missingLiveRequirements.push('allowedAddedViewIds/allowedRemovedViewIds');
  }
  const audit = {
    command: 'dashboard publish',
    dryRun: spec.dryRun !== false,
    specPath,
    dashboardId,
    draftStatus: draft.status,
    currentMainActiveViewIds,
    activeViewIds,
    activeViewDelta: { added: addedViewIds, removed: removedViewIds },
    allowedActiveViewDelta: { added: allowedAddedViewIds, removed: allowedRemovedViewIds },
    missingLiveRequirements,
    wouldBlockLive: missingLiveRequirements.length > 0,
  };
  if (spec.dryRun !== false) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    return;
  }
  if (missingLiveRequirements.length) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    throw new Error(`Dashboard publish blocked; missing or mismatched: ${missingLiveRequirements.join(', ')}`);
  }
  requireSuccess(await apiRequest(config, '/dataVisualization/updatePublishStatus', {
    id: dashboardId,
    name: draft.name,
    mobileLayout: draft.mobileLayout,
    activeViewIds,
    status: 1,
    type: 'dashboard',
  }, 'POST', 120000), 'dashboard publish');
  const published = await getDashboard(config, dashboardId, 'main');
  if (Number(published.status) !== 1 || !sameStringSet(dashboardActiveViewIds(published), activeViewIds)) {
    throw new Error('Published dashboard verification failed');
  }
  process.stdout.write(`${JSON.stringify({ ...audit, verifiedPublished: dashboardSummary(published, 'main') }, null, 2)}\n`);
}

function dateRangeMillis(start, end, utcOffset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) {
    throw new Error('dateRange start/end must use YYYY-MM-DD');
  }
  if (!/^(Z|[+-]\d{2}:\d{2})$/.test(utcOffset || '')) {
    throw new Error('dateRange utcOffset must be Z or +/-HH:MM');
  }
  const startMs = Date.parse(`${start}T00:00:00.000${utcOffset}`);
  const endMs = Date.parse(`${end}T23:59:59.999${utcOffset}`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error('Invalid dateRange');
  return [startMs, endMs];
}

function encodeViewCalculatedFields(view) {
  const copy = structuredClone(view);
  for (const axisName of ['xAxis', 'xAxisExt', 'yAxis', 'yAxisExt', 'extBubble', 'extLabel', 'extStack', 'extTooltip', 'extColor']) {
    for (const field of copy?.[axisName] || []) {
      if (Number(field.extField) === 2 && typeof field.originName === 'string') {
        field.originName = Buffer.from(field.originName, 'utf8').toString('base64');
      }
    }
  }
  return copy;
}

async function chartQuery(config, specArg) {
  const { spec, specPath } = await specFromArg(specArg);
  const dashboardId = exactId(spec.dashboardId, 'dashboardId');
  const viewId = exactId(spec.viewId, 'viewId');
  const source = spec.source || 'main';
  const dashboard = await getDashboard(config, dashboardId, source);
  const views = parseMaybeJson(dashboard.canvasViewInfo, {});
  if (!views[viewId]) throw new Error(`View ${viewId} not found in dashboard ${dashboardId}`);
  const view = encodeViewCalculatedFields(views[viewId]);
  delete view.data;
  const filters = [...(spec.filters || [])];
  if (spec.dateRange) {
    const dateRange = spec.dateRange;
    filters.unshift({
      filterId: exactId(dateRange.filterId, 'dateRange.filterId'),
      componentId: exactId(dateRange.componentId, 'dateRange.componentId'),
      fieldId: exactId(dateRange.fieldId, 'dateRange.fieldId'),
      operator: 'between',
      value: dateRangeMillis(dateRange.start, dateRange.end, dateRange.utcOffset),
      parameters: [],
      isTree: false,
    });
  }
  view.chartExtRequest = {
    user: null,
    filter: filters,
    linkageFilters: spec.linkageFilters || [],
    outerParamsFilters: spec.outerParamsFilters || [],
    webParamsFilters: spec.webParamsFilters || [],
    drill: spec.drill || [],
    resultCount: spec.resultCount ?? view.resultCount,
    resultMode: spec.resultMode ?? view.resultMode,
    goPage: spec.goPage ?? 1,
    pageSize: spec.pageSize ?? 1000,
  };
  const result = requireSuccess(await apiRequest(config, '/chartData/getData', view, 'POST', 120000), 'chart query');
  const report = {
    command: 'chart query',
    specPath,
    dashboardId,
    viewId,
    source,
    totalItems: result?.totalItems,
    fields: result?.data?.fields,
    tableRow: result?.data?.tableRow,
    customSumResult: result?.data?.customSumResult,
  };
  if (spec.includeQuerySql === true) report.querySql = result?.querySql;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function chartDeleteFields(config, specArg) {
  const { spec, specPath } = await specFromArg(specArg);
  const datasetId = exactId(spec.datasetId, 'datasetId');
  const chartId = exactId(spec.chartId, 'chartId');
  const readFields = async () => requireSuccess(await apiRequest(
    config,
    `/chart/listByDQ/${datasetId}/${chartId}`,
    { type: spec.chartType || 'table-normal' },
    'POST',
    120000,
  ), 'chart field inspection');
  const before = await readFields();
  const calculatedBefore = [...(before?.dimensionList || []), ...(before?.quotaList || [])]
    .filter((field) => Number(field.extField) === 2)
    .map((field) => ({ id: String(field.id), name: field.name }));
  const audit = {
    command: 'chart delete-fields',
    dryRun: spec.dryRun !== false,
    specPath,
    datasetId,
    chartId,
    calculatedFields: calculatedBefore,
  };
  if (spec.dryRun !== false) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    return;
  }
  requireSuccess(await apiRequest(config, `/chart/deleteFieldByChart/${chartId}`, {}, 'POST', 120000), 'chart field deletion');
  const after = await readFields();
  const calculatedAfter = [...(after?.dimensionList || []), ...(after?.quotaList || [])]
    .filter((field) => Number(field.extField) === 2);
  if (calculatedAfter.length) throw new Error(`Calculated fields remain for chart ${chartId}`);
  process.stdout.write(`${JSON.stringify({ ...audit, verifiedRemaining: 0 }, null, 2)}\n`);
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  if (cli.help) {
    process.stdout.write(usage());
    return;
  }
  const [command, ...args] = cli.rest;
  if (!command) throw new Error(usage());
  const config = await loadConfig(cli.configPath, cli.allowHttp);
  if (command === 'request') {
    await genericRequest(config, args);
  } else if (command === 'sql-dataset') {
    await sqlDataset(config, args);
  } else if (command === 'dashboard') {
    const [operation, specArg] = args;
    if (operation === 'inspect') await dashboardInspect(config, specArg);
    else if (operation === 'update') await dashboardUpdate(config, specArg);
    else if (operation === 'publish') await dashboardPublish(config, specArg);
    else throw new Error('dashboard operation must be inspect, update, or publish');
  } else if (command === 'chart') {
    const [operation, specArg] = args;
    if (operation === 'query') await chartQuery(config, specArg);
    else if (operation === 'delete-fields') await chartDeleteFields(config, specArg);
    else throw new Error('chart operation must be query or delete-fields');
  } else {
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

export {
  apiRequest,
  authHeaders,
  dashboardActiveViewIds,
  dashboardSummary,
  dateRangeMillis,
  encodeCalculatedAxisFields,
  encodeViewCalculatedFields,
  exactId,
  getDashboard,
  isConnectionPoolError,
  loadConfig,
  parseMaybeJson,
  requireSuccess,
};

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  main().catch((error) => {
    const detail = error.result ? `\n${JSON.stringify(error.result, null, 2)}` : '';
    process.stderr.write(`${error.name}: ${error.message}${detail}\n`);
    process.exitCode = 1;
  });
}
