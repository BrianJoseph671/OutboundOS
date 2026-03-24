import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function verify() {
  // Check users columns
  const userCols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users'
    ORDER BY ordinal_position
  `);
  console.log(`\nUSERS (${userCols.rows.length} columns):`);
  userCols.rows.forEach((r) =>
    console.log(`  ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`)
  );

  // Check contacts columns
  const contactCols = await pool.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'contacts'
    ORDER BY ordinal_position
  `);
  console.log(`\nCONTACTS (${contactCols.rows.length} columns):`);
  contactCols.rows.forEach((r) =>
    console.log(`  ${r.column_name}: nullable=${r.is_nullable}`)
  );

  // Check interactions columns
  const intCols = await pool.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'interactions'
    ORDER BY ordinal_position
  `);
  console.log(`\nINTERACTIONS (${intCols.rows.length} columns):`);
  intCols.rows.forEach((r) =>
    console.log(`  ${r.column_name}: nullable=${r.is_nullable}`)
  );

  // Check indexes
  const indexes = await pool.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE tablename IN ('contacts', 'interactions')
    ORDER BY tablename, indexname
  `);
  console.log(`\nINDEXES:`);
  indexes.rows.forEach((r) => console.log(`  [${r.tablename}] ${r.indexname}`));

  // Check seed user
  const seedUser = await pool.query(
    `SELECT id, username, email, full_name, created_at FROM users WHERE username = 'brian_placeholder'`
  );
  console.log("\nSEED USER:", seedUser.rows[0] ?? "NOT FOUND");

  // Check NULL user_ids
  const nullUsers = await pool.query(
    `SELECT COUNT(*) as count FROM contacts WHERE user_id IS NULL`
  );
  console.log("\nContacts with NULL user_id:", nullUsers.rows[0].count);

  // Check NOT NULL constraint on contacts.user_id
  const notNullCheck = await pool.query(`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'user_id'
  `);
  console.log("contacts.user_id is_nullable:", notNullCheck.rows[0]?.is_nullable);
}

verify()
  .catch(console.error)
  .finally(() => pool.end());
