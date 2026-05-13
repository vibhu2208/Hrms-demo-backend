/**
 * One-time migration utility:
 * - Copies only one company's tenant database (tenant_<companyId>)
 * - Copies matching global records from hrms_global
 *
 * Usage (PowerShell):
 *   $env:SOURCE_MONGODB_URI="mongodb+srv://old-user:old-pass@old-cluster.mongodb.net/hrms_spc?retryWrites=true&w=majority"
 *   $env:TARGET_MONGODB_URI="mongodb+srv://hrms-demo:deoghar@hrms-demo.hvqdjf6.mongodb.net/?retryWrites=true&w=majority"
 *   $env:TARGET_COMPANY_ID="696b515db6c9fd5fd51aed1c"
 *   npm run migrate:single-company
 */

const mongoose = require('mongoose');

const TARGET_COMPANY_ID = process.env.TARGET_COMPANY_ID || '696b515db6c9fd5fd51aed1c';
const SOURCE_URI = process.env.SOURCE_MONGODB_URI;
const TARGET_URI = process.env.TARGET_MONGODB_URI;
const GLOBAL_DB_NAME = 'hrms_global';
const TENANT_DB_NAME = `tenant_${TARGET_COMPANY_ID}`;

const BASELINE_GLOBAL_COLLECTIONS = new Set([
  'modules',
  'permissions',
  'roles',
  'packages',
  'settings'
]);

function assertEnv() {
  if (!SOURCE_URI) {
    throw new Error('Missing SOURCE_MONGODB_URI');
  }
  if (!TARGET_URI) {
    throw new Error('Missing TARGET_MONGODB_URI');
  }
}

function buildDbUri(connectionUri, dbName) {
  const [basePart, queryPart] = connectionUri.split('?');
  const baseWithoutDb = basePart.replace(/\/[^/]*$/, '');
  const finalQuery = queryPart || 'retryWrites=true&w=majority';
  return `${baseWithoutDb}/${dbName}?${finalQuery}`;
}

function hasCompanySignal(value) {
  if (value == null) {
    return false;
  }

  const asString = String(value);
  if (
    asString === TARGET_COMPANY_ID ||
    asString === TENANT_DB_NAME
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasCompanySignal(item));
  }

  if (typeof value === 'object') {
    return Object.values(value).some((item) => hasCompanySignal(item));
  }

  return false;
}

function shouldCopyGlobalDoc(collectionName, doc) {
  if (BASELINE_GLOBAL_COLLECTIONS.has(collectionName)) {
    return true;
  }

  if (collectionName === 'companies' || collectionName === 'companyregistries') {
    return (
      String(doc.companyId || '') === TARGET_COMPANY_ID ||
      String(doc._id || '') === TARGET_COMPANY_ID ||
      String(doc.tenantDatabaseName || '') === TENANT_DB_NAME
    );
  }

  if (collectionName === 'users') {
    if (String(doc.role || '').toLowerCase() === 'superadmin') {
      return true;
    }
  }

  return hasCompanySignal(doc);
}

async function copyCollectionDocuments(sourceDb, targetDb, collectionName, filterFn = null) {
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);

  const docs = await sourceCollection.find({}).toArray();
  const selectedDocs = filterFn ? docs.filter((doc) => filterFn(doc)) : docs;

  if (selectedDocs.length === 0) {
    return { copied: 0, skipped: docs.length };
  }

  await targetCollection.deleteMany({});
  await targetCollection.insertMany(selectedDocs, { ordered: false });

  return {
    copied: selectedDocs.length,
    skipped: docs.length - selectedDocs.length
  };
}

async function copyIndexes(sourceDb, targetDb, collectionName) {
  const sourceIndexes = await sourceDb.collection(collectionName).indexes();
  const targetCollection = targetDb.collection(collectionName);

  for (const idx of sourceIndexes) {
    if (idx.name === '_id_') {
      continue;
    }

    try {
      const indexOptions = {
        name: idx.name,
        background: true
      };

      if (typeof idx.unique === 'boolean') {
        indexOptions.unique = idx.unique;
      }
      if (typeof idx.sparse === 'boolean') {
        indexOptions.sparse = idx.sparse;
      }
      if (typeof idx.expireAfterSeconds === 'number') {
        indexOptions.expireAfterSeconds = idx.expireAfterSeconds;
      }

      await targetCollection.createIndex(idx.key, indexOptions);
    } catch (error) {
      console.warn(`⚠️ Index skip for ${collectionName}.${idx.name}: ${error.message}`);
    }
  }
}

async function copyDatabase(sourceDb, targetDb, mode) {
  const collections = await sourceDb.listCollections().toArray();
  console.log(`\n📦 Copying ${mode} database (${collections.length} collections)`);

  for (const { name } of collections) {
    let result;
    if (mode === 'global') {
      result = await copyCollectionDocuments(
        sourceDb,
        targetDb,
        name,
        (doc) => shouldCopyGlobalDoc(name, doc)
      );
    } else {
      result = await copyCollectionDocuments(sourceDb, targetDb, name);
    }

    await copyIndexes(sourceDb, targetDb, name);

    console.log(
      `  - ${name}: copied=${result.copied}, skipped=${result.skipped}`
    );
  }
}

async function main() {
  assertEnv();

  const sourceGlobalUri = buildDbUri(SOURCE_URI, GLOBAL_DB_NAME);
  const sourceTenantUri = buildDbUri(SOURCE_URI, TENANT_DB_NAME);
  const targetGlobalUri = buildDbUri(TARGET_URI, GLOBAL_DB_NAME);
  const targetTenantUri = buildDbUri(TARGET_URI, TENANT_DB_NAME);

  const sourceGlobalConn = await mongoose.createConnection(sourceGlobalUri).asPromise();
  const sourceTenantConn = await mongoose.createConnection(sourceTenantUri).asPromise();
  const targetGlobalConn = await mongoose.createConnection(targetGlobalUri).asPromise();
  const targetTenantConn = await mongoose.createConnection(targetTenantUri).asPromise();

  try {
    console.log(`🚀 Migrating company ${TARGET_COMPANY_ID} only`);
    console.log(`   Tenant DB: ${TENANT_DB_NAME}`);

    await copyDatabase(sourceGlobalConn.db, targetGlobalConn.db, 'global');
    await copyDatabase(sourceTenantConn.db, targetTenantConn.db, 'tenant');

    console.log('\n✅ Migration completed successfully.');
    console.log('   Only the target company tenant and matching global records were copied.');
  } finally {
    await Promise.all([
      sourceGlobalConn.close(),
      sourceTenantConn.close(),
      targetGlobalConn.close(),
      targetTenantConn.close()
    ]);
  }
}

main().catch((error) => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
