const { Client } = require('pg');

const passwords = ['postgrespassword', 'postgres', 'admin', 'root', '123456', '', 'password'];

async function testConnections() {
  for (const pw of passwords) {
    const client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: pw,
      database: 'postgres',
    });
    try {
      await client.connect();
      console.log(`SUCCESS! Connected with password: "${pw}"`);
      await client.end();
      return pw;
    } catch (err) {
      console.log(`Failed with "${pw}": ${err.message}`);
    }
  }
}

testConnections();
