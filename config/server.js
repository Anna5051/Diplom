const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(express.static(path.resolve(__dirname, "..")));

app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../pages/index.html"));
});

/*проверка роли админа*/
function requireAdmin(req, res, next) {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(401).json({
      message: "Нет доступа: не передан user id",
    });
  }

  const sql = `
    SELECT id, role_id
    FROM users
    WHERE id = ?
    LIMIT 1
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error("ADMIN CHECK ERROR:", err);
      return res.status(500).json({
        message: "Ошибка проверки доступа",
      });
    }

    if (!rows.length) {
      return res.status(403).json({
        message: "Пользователь не найден",
      });
    }

    if (Number(rows[0].role_id) !== 2) {
      return res.status(403).json({
        message: "Только для администратора",
      });
    }

    next();
  });
}

/*Регистрация*/
app.post("/register", (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      message: "Заполните все поля",
    });
  }

  const checkSql = "SELECT id FROM users WHERE email = ?";

  db.query(checkSql, [email], (err, result) => {
    if (err) {
      console.error("REGISTER CHECK ERROR:", err);
      return res.status(500).json({
        message: "Ошибка базы данных",
      });
    }

    if (result.length > 0) {
      return res.status(409).json({
        message: "Email уже зарегистрирован",
      });
    }

    const insertSql = `
      INSERT INTO users (username, email, password_hash, role_id)
      VALUES (?, ?, ?, 1)
    `;

    db.query(insertSql, [username, email, password], (insertErr) => {
      if (insertErr) {
        console.error("REGISTER INSERT ERROR:", insertErr);
        return res.status(500).json({
          message: "Ошибка регистрации",
        });
      }

      res.json({
        message: "Регистрация успешна ✅",
      });
    });
  });
});

/*Авторизация*/
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = `
    SELECT id, username, email, password_hash, role_id, avatar_url, created_at
    FROM users
    WHERE email = ?
    LIMIT 1
  `;

  db.query(sql, [email], (err, result) => {
    if (err) {
      console.error("LOGIN ERROR:", err);
      return res.status(500).json({
        message: "Ошибка авторизации",
      });
    }

    if (result.length === 0) {
      return res.status(401).json({
        message: "Пользователь не найден",
      });
    }

    const user = result[0];

    if (user.password_hash !== password) {
      return res.status(401).json({
        message: "Неверный пароль",
      });
    }

    res.json({
      message: "Вход выполнен ✅",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role_id: user.role_id,
        avatar_url: user.avatar_url || "",
        created_at: user.created_at,
      },
    });
  });
});

/*Создание бота*/
app.post("/create-bot", (req, res) => {
  const {
    creator_id,
    name,
    short_description,
    full_description,
    avatar_url,
    greeting_message,
    system_prompt,
    visibility,
    tags,
  } = req.body;

  if (!creator_id || !name) {
    return res.status(400).json({
      message: "Не хватает обязательных данных",
    });
  }

  const sql = `
    INSERT INTO bots
    (
      creator_id,
      name,
      short_description,
      full_description,
      avatar_url,
      greeting_message,
      system_prompt,
      visibility,
      tags
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      creator_id,
      name,
      short_description || "",
      full_description || "",
      avatar_url || "",
      greeting_message || "",
      system_prompt || "",
      visibility || "public",
      tags || "",
    ],
    (err, result) => {
      if (err) {
        console.error("CREATE BOT ERROR:", err);
        return res.status(500).json({
          message: "Ошибка создания персонажа",
        });
      }

      res.json({
        message: "Персонаж создан ✅",
        bot_id: result.insertId,
      });
    },
  );
});

/*боты пользователей*/
app.get("/my-bots/:userId", (req, res) => {
  const { userId } = req.params;

  const sql = `
    SELECT
      id,
      creator_id,
      name,
      short_description,
      full_description,
      avatar_url,
      greeting_message,
      system_prompt,
      visibility,
      tags,
      created_at,
      updated_at
    FROM bots
    WHERE creator_id = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("MY BOTS ERROR:", err);
      return res.status(500).json({
        message: "Ошибка загрузки персонажей",
      });
    }

    res.json(result);
  });
});

/* бот*/
app.get("/bot/:id", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT
      b.id,
      b.creator_id,
      b.name,
      b.short_description,
      b.full_description,
      b.avatar_url,
      b.greeting_message,
      b.system_prompt,
      b.visibility,
      b.tags,
      b.created_at,
      b.updated_at,
      u.username AS author_name
    FROM bots b
    LEFT JOIN users u ON b.creator_id = u.id
    WHERE b.id = ?
    LIMIT 1
  `;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("GET BOT ERROR:", err);
      return res.status(500).json({
        message: "Ошибка загрузки персонажа",
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        message: "Персонаж не найден",
      });
    }

    res.json(result[0]);
  });
});

/*Обновление бота*/
app.put("/bot/:id", (req, res) => {
  const { id } = req.params;
  const {
    user_id,
    name,
    short_description,
    full_description,
    avatar_url,
    greeting_message,
    system_prompt,
    visibility,
    tags,
  } = req.body;

  if (!user_id) {
    return res.status(400).json({
      message: "Не указан пользователь",
    });
  }

  const checkSql = `
    SELECT id, creator_id
    FROM bots
    WHERE id = ?
    LIMIT 1
  `;

  db.query(checkSql, [id], (err, result) => {
    if (err) {
      console.error("CHECK BOT ERROR:", err);
      return res.status(500).json({
        message: "Ошибка проверки бота",
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        message: "Бот не найден",
      });
    }

    const bot = result[0];

    if (Number(bot.creator_id) !== Number(user_id)) {
      return res.status(403).json({
        message: "Вы не можете редактировать этого бота",
      });
    }

    const updateSql = `
      UPDATE bots
      SET
        name = ?,
        short_description = ?,
        full_description = ?,
        avatar_url = ?,
        greeting_message = ?,
        system_prompt = ?,
        visibility = ?,
        tags = ?,
        updated_at = NOW()
      WHERE id = ?
    `;

    db.query(
      updateSql,
      [
        name || "",
        short_description || "",
        full_description || "",
        avatar_url || "",
        greeting_message || "",
        system_prompt || "",
        visibility || "public",
        tags || "",
        id,
      ],
      (updateErr) => {
        if (updateErr) {
          console.error("UPDATE BOT ERROR:", updateErr);
          return res.status(500).json({
            message: "Ошибка обновления бота",
          });
        }

        res.json({
          message: "Бот обновлён ✅",
        });
      },
    );
  });
});

/*Удаление бота*/
app.delete("/bot/:id", (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({
      message: "Не указан пользователь",
    });
  }

  const checkSql = `
    SELECT id, creator_id
    FROM bots
    WHERE id = ?
    LIMIT 1
  `;

  db.query(checkSql, [id], (err, result) => {
    if (err) {
      console.error("DELETE CHECK BOT ERROR:", err);
      return res.status(500).json({
        message: "Ошибка проверки бота",
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        message: "Бот не найден",
      });
    }

    const bot = result[0];

    if (Number(bot.creator_id) !== Number(user_id)) {
      return res.status(403).json({
        message: "Вы не можете удалить этого бота",
      });
    }

    const deleteMessagesSql = `
      DELETE m
      FROM messages m
      INNER JOIN chats c ON m.chat_id = c.id
      WHERE c.bot_id = ?
    `;

    db.query(deleteMessagesSql, [id], (messagesErr) => {
      if (messagesErr) {
        console.error("DELETE BOT MESSAGES ERROR:", messagesErr);
        return res.status(500).json({
          message: "Ошибка удаления сообщений",
        });
      }

      const deleteChatsSql = `DELETE FROM chats WHERE bot_id = ?`;

      db.query(deleteChatsSql, [id], (chatsErr) => {
        if (chatsErr) {
          console.error("DELETE BOT CHATS ERROR:", chatsErr);
          return res.status(500).json({
            message: "Ошибка удаления чатов",
          });
        }

        const deleteBotSql = `DELETE FROM bots WHERE id = ?`;

        db.query(deleteBotSql, [id], (deleteErr) => {
          if (deleteErr) {
            console.error("DELETE BOT ERROR:", deleteErr);
            return res.status(500).json({
              message: "Ошибка удаления бота",
            });
          }

          res.json({
            message: "Бот удалён ✅",
          });
        });
      });
    });
  });
});

/*Создать чат id бота*/
app.get("/chat-by-bot/:botId", (req, res) => {
  const { botId } = req.params;
  const userId = Number(req.query.user_id) || 1;

  const getBotSql = `
    SELECT
      id,
      name,
      avatar_url,
      greeting_message,
      short_description,
      full_description,
      system_prompt
    FROM bots
    WHERE id = ?
    LIMIT 1
  `;

  db.query(getBotSql, [botId], (botErr, botRows) => {
    if (botErr) {
      console.error("GET BOT FOR CHAT ERROR:", botErr);
      return res.status(500).json({
        message: "Ошибка загрузки бота",
      });
    }

    if (botRows.length === 0) {
      return res.status(404).json({
        message: "Бот не найден",
      });
    }

    const bot = botRows[0];
const createNewChat = req.query.new === "1";
    const findChatSql = `
      SELECT
        id,
        user_id,
        bot_id,
        persona_id,
        title,
        summary,
        visibility,
        created_at,
        updated_at
      FROM chats
      WHERE user_id = ? AND bot_id = ?
      LIMIT 1
    `;

    db.query(findChatSql, [userId, botId], (chatErr, chatRows) => {
      if (chatErr) {
        console.error("FIND CHAT ERROR:", chatErr);
        return res.status(500).json({
          message: "Ошибка поиска чата",
        });
      }

      const sendFullChat = (chat) => {
        const messagesSql = `
          SELECT
            id,
            chat_id,
            sender_type,
            content,
            created_at
          FROM messages
          WHERE chat_id = ?
          ORDER BY created_at ASC, id ASC
        `;

        db.query(messagesSql, [chat.id], (msgErr, msgRows) => {
          if (msgErr) {
            console.error("GET MESSAGES ERROR:", msgErr);
            return res.status(500).json({
              message: "Ошибка загрузки сообщений",
            });
          }

          res.json({
            chat,
            bot,
            messages: msgRows,
          });
        });
      };

   if (!createNewChat && chatRows.length > 0) {
  return sendFullChat(chatRows[0]);
}

      const insertChatSql = `
        INSERT INTO chats
        (
          user_id,
          bot_id,
          persona_id,
          title,
          summary,
          visibility,
          created_at,
          updated_at
        )
        VALUES (?, ?, NULL, ?, '', 'private', NOW(), NOW())
      `;

      db.query(
        insertChatSql,
        [userId, botId, `Чат с ${bot.name}`],
        (insertErr, insertResult) => {
          if (insertErr) {
            console.error("CREATE CHAT ERROR:", insertErr);
            return res.status(500).json({
              message: "Ошибка создания чата",
            });
          }

          const newChat = {
            id: insertResult.insertId,
            user_id: userId,
            bot_id: Number(botId),
            persona_id: null,
            title: `Чат с ${bot.name}`,
            summary: "",
            visibility: "private",
          };

          if (bot.greeting_message && bot.greeting_message.trim()) {
            const greetingSql = `
              INSERT INTO messages
              (
                chat_id,
                sender_type,
                content,
                created_at
              )
              VALUES (?, 'bot', ?, NOW())
            `;

            db.query(
              greetingSql,
              [newChat.id, bot.greeting_message],
              (greetErr) => {
                if (greetErr) {
                  console.error("SAVE GREETING ERROR:", greetErr);
                  return res.status(500).json({
                    message: "Чат создан, но приветствие не сохранилось",
                  });
                }

                sendFullChat(newChat);
              },
            );
          } else {
            sendFullChat(newChat);
          }
        },
      );
    });
  });
});

/*Получение чата по id*/
app.get("/chat/:chatId", (req, res) => {
  const { chatId } = req.params;

  const chatSql = `
    SELECT
      c.id,
      c.user_id,
      c.bot_id,
      c.persona_id,
      c.title,
      c.summary,
      c.visibility,
      c.created_at,
      c.updated_at,
      b.name AS bot_name,
      b.avatar_url,
      b.greeting_message
    FROM chats c
    LEFT JOIN bots b ON c.bot_id = b.id
    WHERE c.id = ?
    LIMIT 1
  `;

  db.query(chatSql, [chatId], (chatErr, chatRows) => {
    if (chatErr) {
      console.error("GET CHAT ERROR:", chatErr);
      return res.status(500).json({
        message: "Ошибка загрузки чата",
      });
    }

    if (chatRows.length === 0) {
      return res.status(404).json({
        message: "Чат не найден",
      });
    }

    const chat = chatRows[0];

    const messagesSql = `
      SELECT
        id,
        chat_id,
        sender_type,
        content,
        created_at
      FROM messages
      WHERE chat_id = ?
      ORDER BY created_at ASC, id ASC
    `;

    db.query(messagesSql, [chatId], (msgErr, msgRows) => {
      if (msgErr) {
        console.error("GET CHAT MESSAGES ERROR:", msgErr);
        return res.status(500).json({
          message: "Ошибка загрузки сообщений",
        });
      }

      res.json({
        chat,
        bot: {
          id: chat.bot_id,
          name: chat.bot_name,
          avatar_url: chat.avatar_url,
          greeting_message: chat.greeting_message,
        },
        messages: msgRows,
      });
    });
  });
});

/*отправка сообщений*/
app.post("/chat/:chatId/message", (req, res) => {
  const { chatId } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({
      message: "Пустое сообщение",
    });
  }

  const getChatSql = `
    SELECT
      c.id,
      c.bot_id,
      b.name AS bot_name
    FROM chats c
    LEFT JOIN bots b ON c.bot_id = b.id
    WHERE c.id = ?
    LIMIT 1
  `;

  db.query(getChatSql, [chatId], (chatErr, chatRows) => {
    if (chatErr) {
      console.error("CHECK CHAT ERROR:", chatErr);
      return res.status(500).json({
        message: "Ошибка проверки чата",
      });
    }

    if (chatRows.length === 0) {
      return res.status(404).json({
        message: "Чат не найден",
      });
    }

    const chat = chatRows[0];

    const saveUserMessageSql = `
      INSERT INTO messages
      (
        chat_id,
        sender_type,
        content,
        created_at
      )
      VALUES (?, 'user', ?, NOW())
    `;

    db.query(saveUserMessageSql, [chatId, text.trim()], (saveUserErr) => {
      if (saveUserErr) {
        console.error("SAVE USER MESSAGE ERROR:", saveUserErr);
        return res.status(500).json({
          message: "Ошибка сохранения сообщения пользователя",
        });
      }

      const botReply = `Ответ персонажа ${chat.bot_name}: ${text.trim()}`;

      const saveBotMessageSql = `
        INSERT INTO messages
        (
          chat_id,
          sender_type,
          content,
          created_at
        )
        VALUES (?, 'bot', ?, NOW())
      `;

      db.query(saveBotMessageSql, [chatId, botReply], (saveBotErr) => {
        if (saveBotErr) {
          console.error("SAVE BOT MESSAGE ERROR:", saveBotErr);
          return res.status(500).json({
            message: "Ошибка сохранения ответа бота",
          });
        }

        const updateChatSql = `
          UPDATE chats
          SET updated_at = NOW()
          WHERE id = ?
        `;

        db.query(updateChatSql, [chatId], (updateErr) => {
          if (updateErr) {
            console.error("UPDATE CHAT TIME ERROR:", updateErr);
          }

          res.json({
            message: "Сообщение отправлено ✅",
            reply: {
              sender_type: "bot",
              content: botReply,
            },
          });
        });
      });
    });
  });
});

/*мои чаты*/
app.get("/my-chats/:userId", (req, res) => {
  const { userId } = req.params;

  const sql = `
    SELECT
      c.id,
      c.user_id,
      c.bot_id,
      c.title,
      c.summary,
      c.visibility,
      c.created_at,
      c.updated_at,
      b.name AS bot_name,
      b.avatar_url
    FROM chats c
    LEFT JOIN bots b ON c.bot_id = b.id
    WHERE c.user_id = ?
    ORDER BY c.updated_at DESC, c.created_at DESC
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error("MY CHATS ERROR:", err);
      return res.status(500).json({
        message: "Ошибка загрузки чатов",
      });
    }

    res.json(rows);
  });
});

/*Начало Админ. Получение пользователей*/
app.get("/admin/users", requireAdmin, (req, res) => {
  const sql = `
    SELECT
      id,
      username,
      email,
      role_id,
      avatar_url,
      created_at
    FROM users
    ORDER BY id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("ADMIN USERS ERROR:", err);
      return res.status(500).json({
        message: "Ошибка загрузки пользователей",
      });
    }

    res.json(rows);
  });
});

app.put("/admin/users/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { username, email, role_id } = req.body;

  const sql = `
    UPDATE users
    SET
      username = ?,
      email = ?,
      role_id = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [username || "", email || "", Number(role_id) || 1, id],
    (err) => {
      if (err) {
        console.error("ADMIN UPDATE USER ERROR:", err);
        return res.status(500).json({
          message: "Ошибка обновления пользователя",
        });
      }

      res.json({
        message: "Пользователь обновлён ✅",
      });
    },
  );
});

/*Удаление пользователя*/
app.delete("/admin/users/:id", requireAdmin, (req, res) => {
  const { id } = req.params;

  if (Number(id) === Number(req.headers["x-user-id"])) {
    return res.status(400).json({
      message: "Нельзя удалить самого себя",
    });
  }

  const deleteMessagesSql = `
    DELETE m
    FROM messages m
    INNER JOIN chats c ON m.chat_id = c.id
    WHERE c.user_id = ?
  `;

  db.query(deleteMessagesSql, [id], (messagesErr) => {
    if (messagesErr) {
      console.error("ADMIN DELETE USER MESSAGES ERROR:", messagesErr);
      return res.status(500).json({
        message: "Ошибка удаления сообщений пользователя",
      });
    }

    const deleteChatsSql = `DELETE FROM chats WHERE user_id = ?`;

    db.query(deleteChatsSql, [id], (chatsErr) => {
      if (chatsErr) {
        console.error("ADMIN DELETE USER CHATS ERROR:", chatsErr);
        return res.status(500).json({
          message: "Ошибка удаления чатов пользователя",
        });
      }

      const deleteBotsMessagesSql = `
        DELETE m
        FROM messages m
        INNER JOIN chats c ON m.chat_id = c.id
        INNER JOIN bots b ON c.bot_id = b.id
        WHERE b.creator_id = ?
      `;

      db.query(deleteBotsMessagesSql, [id], (bmErr) => {
        if (bmErr) {
          console.error("ADMIN DELETE USER BOTS MESSAGES ERROR:", bmErr);
          return res.status(500).json({
            message: "Ошибка удаления сообщений ботов пользователя",
          });
        }

        const deleteBotsChatsSql = `
          DELETE c
          FROM chats c
          INNER JOIN bots b ON c.bot_id = b.id
          WHERE b.creator_id = ?
        `;

        db.query(deleteBotsChatsSql, [id], (bcErr) => {
          if (bcErr) {
            console.error("ADMIN DELETE USER BOTS CHATS ERROR:", bcErr);
            return res.status(500).json({
              message: "Ошибка удаления чатов ботов пользователя",
            });
          }

          const deleteBotsSql = `DELETE FROM bots WHERE creator_id = ?`;

          db.query(deleteBotsSql, [id], (botsErr) => {
            if (botsErr) {
              console.error("ADMIN DELETE USER BOTS ERROR:", botsErr);
              return res.status(500).json({
                message: "Ошибка удаления ботов пользователя",
              });
            }

            const deleteUserSql = `DELETE FROM users WHERE id = ?`;

            db.query(deleteUserSql, [id], (userErr) => {
              if (userErr) {
                console.error("ADMIN DELETE USER ERROR:", userErr);
                return res.status(500).json({
                  message: "Ошибка удаления пользователя",
                });
              }

              res.json({
                message: "Пользователь удалён ✅",
              });
            });
          });
        });
      });
    });
  });
});

app.get("/admin/bots", requireAdmin, (req, res) => {
  const sql = `
    SELECT
      b.id,
      b.name,
      b.creator_id,
      b.avatar_url,
      b.visibility,
      b.tags,
      b.created_at,
      u.username AS author_name
    FROM bots b
    LEFT JOIN users u ON b.creator_id = u.id
    ORDER BY b.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("ADMIN BOTS ERROR:", err);
      return res.status(500).json({
        message: "Ошибка загрузки ботов",
      });
    }

    res.json(rows);
  });
});

app.put("/admin/bots/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, visibility, tags } = req.body;

  const sql = `
    UPDATE bots
    SET
      name = ?,
      visibility = ?,
      tags = ?,
      updated_at = NOW()
    WHERE id = ?
  `;

  db.query(sql, [name || "", visibility || "public", tags || "", id], (err) => {
    if (err) {
      console.error("ADMIN UPDATE BOT ERROR:", err);
      return res.status(500).json({
        message: "Ошибка обновления бота",
      });
    }

    res.json({
      message: "Бот обновлён ✅",
    });
  });
});

/*Удаление бота админом*/
app.delete("/admin/bots/:id", requireAdmin, (req, res) => {
  const { id } = req.params;

  const deleteMessagesSql = `
    DELETE m
    FROM messages m
    INNER JOIN chats c ON m.chat_id = c.id
    WHERE c.bot_id = ?
  `;

  db.query(deleteMessagesSql, [id], (messagesErr) => {
    if (messagesErr) {
      console.error("ADMIN DELETE BOT MESSAGES ERROR:", messagesErr);
      return res.status(500).json({
        message: "Ошибка удаления сообщений бота",
      });
    }

    const deleteChatsSql = `DELETE FROM chats WHERE bot_id = ?`;

    db.query(deleteChatsSql, [id], (chatsErr) => {
      if (chatsErr) {
        console.error("ADMIN DELETE BOT CHATS ERROR:", chatsErr);
        return res.status(500).json({
          message: "Ошибка удаления чатов бота",
        });
      }

      const deleteBotSql = `DELETE FROM bots WHERE id = ?`;

      db.query(deleteBotSql, [id], (err) => {
        if (err) {
          console.error("ADMIN DELETE BOT ERROR:", err);
          return res.status(500).json({
            message: "Ошибка удаления бота",
          });
        }

        res.json({
          message: "Бот удалён ✅",
        });
      });
    });
  });
});

app.get("/admin/chats", requireAdmin, (req, res) => {
  const sql = `
    SELECT
      c.id,
      c.user_id,
      c.bot_id,
      c.persona_id,
      c.title,
      c.summary,
      c.visibility,
      c.created_at,
      c.updated_at,
      u.username AS user_name,
      b.name AS bot_name
    FROM chats c
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN bots b ON c.bot_id = b.id
    ORDER BY c.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("ADMIN CHATS ERROR:", err);
      return res.status(500).json({
        message: "Ошибка загрузки чатов",
      });
    }

    res.json(rows);
  });
});

/*Удаление чата адамином*/
app.delete("/admin/chats/:id", requireAdmin, (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM messages WHERE chat_id = ?", [id], (msgErr) => {
    if (msgErr) {
      console.error("ADMIN DELETE CHAT MESSAGES ERROR:", msgErr);
      return res.status(500).json({
        message: "Ошибка удаления сообщений чата",
      });
    }

    db.query("DELETE FROM chats WHERE id = ?", [id], (chatErr) => {
      if (chatErr) {
        console.error("ADMIN DELETE CHAT ERROR:", chatErr);
        return res.status(500).json({
          message: "Ошибка удаления чата",
        });
      }

      res.json({
        message: "Чат удалён ✅",
      });
    });
  });
});
/* публичые боты*/
app.get("/all-bots", (req, res) => {
  const sql = `
    SELECT
      b.id,
      b.creator_id,
      b.name,
      b.short_description,
      b.full_description,
      b.avatar_url,
      b.greeting_message,
      b.system_prompt,
      b.visibility,
      b.tags,
      b.created_at,
      b.updated_at,
      u.username AS author_name
    FROM bots b
    LEFT JOIN users u ON b.creator_id = u.id
    WHERE b.visibility = 'public'
    ORDER BY b.created_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("ALL BOTS ERROR:", err);
      return res.status(500).json({
        message: "Ошибка загрузки всех ботов",
      });
    }

    res.json(rows);
  });
});


/* ===================== ПЕРСОНЫ ===================== */

/* Получить персоны пользователя */
app.get("/personas/:userId", (req, res) => {
  const { userId } = req.params;

  const sql = `
    SELECT
      id,
      user_id,
      name,
      description,
      avatar_url,
      persona_prompt,
      is_default,
      created_at,
      updated_at
    FROM personas
    WHERE user_id = ?
    ORDER BY is_default DESC, created_at DESC
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error("GET PERSONAS ERROR:", err);
      return res.status(500).json({
        message: "Ошибка загрузки персон",
      });
    }

    res.json(rows);
  });
});

/* Создать персону */
app.post("/persona", (req, res) => {
  const {
    user_id,
    name,
    description,
    avatar_url,
    persona_prompt,
    is_default,
  } = req.body;

  if (!user_id || !name || !description) {
    return res.status(400).json({
      message: "Заполните имя и описание",
    });
  }

  const createPersona = () => {
    const sql = `
      INSERT INTO personas
      (
        user_id,
        name,
        description,
        avatar_url,
        persona_prompt,
        is_default,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    db.query(
      sql,
      [
        user_id,
        name,
        description,
        avatar_url || "",
        persona_prompt || "",
        Number(is_default) === 1 ? 1 : 0,
      ],
      (err, result) => {
        if (err) {
          console.error("CREATE PERSONA ERROR:", err);
          return res.status(500).json({
            message: "Ошибка создания персоны",
          });
        }

        res.json({
          message: "Персона создана ✅",
          persona_id: result.insertId,
        });
      }
    );
  };

  if (Number(is_default) === 1) {
    db.query(
      "UPDATE personas SET is_default = 0 WHERE user_id = ?",
      [user_id],
      (err) => {
        if (err) {
          console.error("RESET DEFAULT PERSONA ERROR:", err);
          return res.status(500).json({
            message: "Ошибка выбора основной персоны",
          });
        }

        createPersona();
      }
    );
  } else {
    createPersona();
  }
});

/* Обновить персону */
app.put("/persona/:id", (req, res) => {
  const { id } = req.params;
  const {
    user_id,
    name,
    description,
    avatar_url,
    persona_prompt,
    is_default,
  } = req.body;

  if (!user_id || !name || !description) {
    return res.status(400).json({
      message: "Заполните имя и описание",
    });
  }

  const updatePersona = () => {
    const sql = `
      UPDATE personas
      SET
        name = ?,
        description = ?,
        avatar_url = ?,
        persona_prompt = ?,
        is_default = ?,
        updated_at = NOW()
      WHERE id = ? AND user_id = ?
    `;

    db.query(
      sql,
      [
        name,
        description,
        avatar_url || "",
        persona_prompt || "",
        Number(is_default) === 1 ? 1 : 0,
        id,
        user_id,
      ],
      (err, result) => {
        if (err) {
          console.error("UPDATE PERSONA ERROR:", err);
          return res.status(500).json({
            message: "Ошибка обновления персоны",
          });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({
            message: "Персона не найдена",
          });
        }

        res.json({
          message: "Персона обновлена ✅",
        });
      }
    );
  };

  if (Number(is_default) === 1) {
    db.query(
      "UPDATE personas SET is_default = 0 WHERE user_id = ?",
      [user_id],
      (err) => {
        if (err) {
          console.error("RESET DEFAULT PERSONA ERROR:", err);
          return res.status(500).json({
            message: "Ошибка выбора основной персоны",
          });
        }

        updatePersona();
      }
    );
  } else {
    updatePersona();
  }
});

/* Сделать персону основной */
app.put("/persona/:id/default", (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({
      message: "Не указан пользователь",
    });
  }

  db.query(
    "UPDATE personas SET is_default = 0 WHERE user_id = ?",
    [user_id],
    (err) => {
      if (err) {
        console.error("RESET DEFAULT PERSONA ERROR:", err);
        return res.status(500).json({
          message: "Ошибка обновления персон",
        });
      }

      db.query(
        "UPDATE personas SET is_default = 1 WHERE id = ? AND user_id = ?",
        [id, user_id],
        (updateErr, result) => {
          if (updateErr) {
            console.error("SET DEFAULT PERSONA ERROR:", updateErr);
            return res.status(500).json({
              message: "Ошибка выбора персоны",
            });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({
              message: "Персона не найдена",
            });
          }

          res.json({
            message: "Основная персона выбрана ✅",
          });
        }
      );
    }
  );
});

/* Удалить персону */
app.delete("/persona/:id", (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({
      message: "Не указан пользователь",
    });
  }

  const sql = `
    DELETE FROM personas
    WHERE id = ? AND user_id = ?
  `;

  db.query(sql, [id, user_id], (err, result) => {
    if (err) {
      console.error("DELETE PERSONA ERROR:", err);
      return res.status(500).json({
        message: "Ошибка удаления персоны",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Персона не найдена",
      });
    }

    res.json({
      message: "Персона удалена ✅",
    });
  });
});
/* удалить сообщения чата */
app.delete("/chat/:chatId/messages", (req, res) => {
  const { chatId } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: "Не указан пользователь" });
  }

  const checkSql = `
    SELECT id, user_id
    FROM chats
    WHERE id = ?
    LIMIT 1
  `;

  db.query(checkSql, [chatId], (err, rows) => {
    if (err) {
      console.error("CHECK CHAT OWNER ERROR:", err);
      return res.status(500).json({ message: "Ошибка проверки чата" });
    }

    if (!rows.length) {
      return res.status(404).json({ message: "Чат не найден" });
    }

    if (Number(rows[0].user_id) !== Number(user_id)) {
      return res.status(403).json({ message: "Нет доступа к этому чату" });
    }

    db.query("DELETE FROM messages WHERE chat_id = ?", [chatId], (deleteErr) => {
      if (deleteErr) {
        console.error("DELETE CHAT MESSAGES ERROR:", deleteErr);
        return res.status(500).json({ message: "Ошибка удаления сообщений" });
      }

      db.query(
        "UPDATE chats SET updated_at = NOW() WHERE id = ?",
        [chatId],
        () => {
          res.json({ message: "Сообщения удалены ✅" });
        }
      );
    });
  });
});

/* удалить чат полностью */
app.delete("/chat/:chatId", (req, res) => {
  const { chatId } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: "Не указан пользователь" });
  }

  const checkSql = `
    SELECT id, user_id
    FROM chats
    WHERE id = ?
    LIMIT 1
  `;

  db.query(checkSql, [chatId], (err, rows) => {
    if (err) {
      console.error("CHECK CHAT DELETE ERROR:", err);
      return res.status(500).json({ message: "Ошибка проверки чата" });
    }

    if (!rows.length) {
      return res.status(404).json({ message: "Чат не найден" });
    }

    if (Number(rows[0].user_id) !== Number(user_id)) {
      return res.status(403).json({ message: "Нет доступа к этому чату" });
    }

    db.query("DELETE FROM messages WHERE chat_id = ?", [chatId], (msgErr) => {
      if (msgErr) {
        console.error("DELETE CHAT MSG ERROR:", msgErr);
        return res.status(500).json({ message: "Ошибка удаления сообщений" });
      }

      db.query("DELETE FROM chats WHERE id = ?", [chatId], (chatErr) => {
        if (chatErr) {
          console.error("DELETE CHAT ERROR:", chatErr);
          return res.status(500).json({ message: "Ошибка удаления чата" });
        }

        res.json({ message: "Чат удалён ✅" });
      });
    });
  });
});





const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
