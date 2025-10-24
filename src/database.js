
+const fs = require('fs');
+const path = require('path');
+const sqlite3 = require('sqlite3').verbose();
+
+const defaultDataDirectory = path.join(__dirname, '..', 'data');
+const defaultDatabaseFilename = 'sales.sqlite';
+
+const ensureDirectoryExists = (databasePath) => {
+  if (!databasePath || databasePath === ':memory:') {
+    return;
+  }
+
+  // Skip directory creation for URI-style in-memory databases (e.g., file::memory:?cache=shared)
+  if (databasePath.startsWith('file:') && databasePath.includes('memory')) {
+    return;
+  }
+
+  const directory = path.dirname(databasePath);
+  fs.mkdirSync(directory, { recursive: true });
+};
+
+const resolveDatabasePath = (explicitPath) => {
+  if (explicitPath) {
+    return explicitPath;
+  }
+
+  if (process.env.SQLITE_DB_PATH) {
+    return process.env.SQLITE_DB_PATH;
+  }
+
+  return path.join(defaultDataDirectory, defaultDatabaseFilename);
+};
+
+const createDatabase = (options = {}) => {
+  const databasePath = resolveDatabasePath(options.path || options.filename || options.databasePath);
+  ensureDirectoryExists(databasePath);
+
+  const db = new sqlite3.Database(databasePath);
+
+  db.serialize(() => {
+    db.run(
+      `CREATE TABLE IF NOT EXISTS sales (
+        transaction_id TEXT PRIMARY KEY,
+        status_code INTEGER,
+        status_text TEXT,
+        client_email TEXT,
+        product_name TEXT,
+        total_value_cents INTEGER,
+        created_at TEXT,
+        updated_at TEXT,
+        raw_payload TEXT
+      )`
+    );
+  });
+
+  return db;
+};
+
+module.exports = {
+  createDatabase,
+  defaultDataDirectory,
+  defaultDatabaseFilename
+};
 
EOF
)