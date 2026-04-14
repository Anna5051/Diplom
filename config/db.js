const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

db.connect((err) => {
  if (err) {
    console.error("Ошибка подключения к базе данных ❌:", err);
    return;
  }

  console.log("Подключено к MySQL успешно ✅");
});

module.exports = db;