const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/database');

async function main() {
  const name = process.env.SUPER_ADMIN_NAME || 'KnightClub Super Admin';
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password || password.length < 8) {
    throw new Error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD with at least 8 characters.');
  }

  const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (existing.length) {
    await query(
      "UPDATE users SET role = 'super_admin', status = 'active' WHERE id = ?",
      [existing[0].id],
    );
    console.log(`Promoted existing user ${email} to super_admin.`);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await query(
    "INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, 'super_admin', 'active')",
    [name, email.toLowerCase(), hash],
  );
  console.log(`Created super admin ${email}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
