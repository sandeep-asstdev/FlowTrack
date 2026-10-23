const { Client } = require('pg');

const passwords = ['postgrespassword', 'postgres', 'admin', 'root', '123456', '', 'password'];
const ports = [5432, 5433, 6699];

async function testConnections() {
  for (const port of ports) {
    console.log(`\n--- Testing port ${port} ---`);
    for (const pw of passwords) {
      const client = new Client({
        host: 'localhost',
        port: port,
        user: 'postgres',
        password: pw,
        database: 'postgres',
        connectionTimeoutMillis: 2000,
      });
      try {
        await client.connect();
        console.log(` SUCCESS! Connected on port ${port} with password: "${pw}"`);
        
        // Check if flowtrack DB exists, create if not
        const res = await client.query("SELECT 1 FROM pg_database WHERE datname='flowtrack'");
        if (res.rows.length === 0) {
          console.log("Creating database 'flowtrack'...");
          await client.query('CREATE DATABASE flowtrack');
          console.log("Database 'flowtrack' created successfully!");
        } else {
          console.log("Database 'flowtrack' already exists.");
        }

        await client.end();
        return { port, password: pw };
      } catch (err) {
        if (!err.message.includes('password authentication failed')) {
          console.log(`Port ${port} error: ${err.message}`);
          break;
        }
      }
    }
  }
  console.log('\nCould not connect with tested passwords/ports.');
}

testConnections();
