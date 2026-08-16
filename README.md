# TokTickIT 

# TokTickIT 🎫

**TokTickIT** คือระบบจัดการ Ticket สำหรับสร้าง ติดตาม และจัดการงานภายในทีม

โปรเจกต์แบ่งออกเป็น 2 ส่วนหลัก:

* **Frontend:** React + TypeScript + Vite
* **Backend:** Node.js + Express + TypeScript + Prisma + PostgreSQL

---

## 🛠️ Tech Stack

### Frontend

* React
* TypeScript
* Vite
* Bootstrap

### Backend

* Node.js
* TypeScript
* Express.js
* Prisma ORM
* PostgreSQL

### Testing

* Vitest
* Supertest

### Development

* npm
* tsx
* Git / GitHub

---

## 📁 Project Structure

```text
toktickit/
├── client/          # Frontend — React + TypeScript + Vite
├── server/          # Backend — Node.js + Express + TypeScript
├── .gitignore
└── README.md
```

โดยทั่วไป:

* ถ้าทำงานเกี่ยวกับ **หน้าเว็บ / UI** → เข้า `client/`
* ถ้าทำงานเกี่ยวกับ **API / Database / Backend** → เข้า `server/`

---

# 🚀 Getting Started

## 1. สิ่งที่ต้องติดตั้งก่อน

ตรวจสอบว่าเครื่องมี:

* Node.js **v18 หรือใหม่กว่า**
* npm
* PostgreSQL
* Git

PostgreSQL สามารถรันผ่าน:

* Postgres.app
* Docker
* PostgreSQL ที่ติดตั้งในเครื่องโดยตรง

---

## 2. Clone โปรเจกต์

```bash
git clone <repository-url>
cd toktickit
```

---

# ⚙️ Backend Setup

เข้าโฟลเดอร์ `server`

```bash
cd server
```

ติดตั้ง dependencies:

```bash
npm install
```

สร้างไฟล์ `.env` จาก `.env.example`

```bash
cp .env.example .env
```

จากนั้นแก้ไขค่าใน `.env` ให้ตรงกับ PostgreSQL ของเครื่อง

ตัวอย่าง:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/toktickit?schema=public"
PORT=3000
```

> เปลี่ยน `user` และ `password` ให้ตรงกับ PostgreSQL ของเครื่อง

---

## 🗄️ Setup Database

สร้าง Prisma Client:

```bash
npx prisma generate
```

สร้างหรืออัปเดต Database ตาม Prisma schema:

```bash
npx prisma migrate dev
```

หากต้องการดูข้อมูลใน Database ผ่าน UI:

```bash
npx prisma studio
```

---

## ▶️ Run Backend

```bash
npm run dev
```

Backend จะรันที่:

```text
http://localhost:3000
```

หรือ Port ที่กำหนดไว้ใน `.env`

---

## 🧪 Test Backend

รัน test:

```bash
npm run test
```

โปรเจกต์ใช้:

* **Vitest** สำหรับ Test Runner
* **Supertest** สำหรับทดสอบ API endpoints

---

# 🎨 Frontend Setup

เปิด Terminal อีกหน้าหนึ่ง แล้วกลับมาที่ root ของโปรเจกต์

```bash
cd client
```

ติดตั้ง dependencies:

```bash
npm install
```

รัน Frontend:

```bash
npm run dev
```

Frontend จะรันที่:

```text
http://localhost:5173
```

ซึ่งเป็น Default Port ของ Vite

> Bootstrap ถูกติดตั้งและ import ไว้ในโปรเจกต์แล้ว

---

# 💻 การรันโปรเจกต์ตอนพัฒนา

ปกติควรเปิด **2 Terminal**

### Terminal 1 — Backend

```bash
cd server
npm run dev
```

### Terminal 2 — Frontend

```bash
cd client
npm run dev
```

จากนั้นเปิด:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:3000
```

---

# 📜 Available Commands

## Backend — `server/`

| Command                  | ใช้สำหรับ                          |
| ------------------------ | ---------------------------------- |
| `npm run dev`            | รัน Backend แบบ Development        |
| `npm run build`          | Compile TypeScript เป็น JavaScript |
| `npm run start`          | รัน Production Build               |
| `npm run test`           | รัน Test Suite                     |
| `npx prisma generate`    | Generate Prisma Client             |
| `npx prisma migrate dev` | สร้างและรัน Database Migration     |
| `npx prisma studio`      | เปิด Prisma Studio                 |

---

## Frontend — `client/`

| Command           | ใช้สำหรับ                        |
| ----------------- | -------------------------------- |
| `npm run dev`     | รัน Vite Development Server      |
| `npm run build`   | Build Frontend สำหรับ Production |
| `npm run preview` | Preview Production Build         |

---

# 🔐 Environment Variables

ตัวอย่าง Environment Variables อยู่ที่:

```text
server/.env.example
```

เมื่อตั้งค่าเครื่องใหม่ ให้สร้าง:

```text
server/.env
```

จาก `.env.example`

### ⚠️ Important

**ห้าม Commit `.env` ขึ้น GitHub**

เพราะอาจมีข้อมูลสำคัญ เช่น:

* Database password
* API keys
* Secret keys
* Tokens

ไฟล์ `.env` ถูกกำหนดไว้ใน `.gitignore` แล้ว

---

# 🌿 Git & Branching

โปรเจกต์ใช้ Branch แยกตาม Issue / Feature

ตัวอย่าง:

```text
feature/1-project-foundation
```

รูปแบบที่แนะนำ:

```text
feature/<issue-number>-<ชื่อ-feature>
```

ตัวอย่าง:

```text
feature/2-health-check
feature/3-ticket-list
feature/4-create-ticket
```

เมื่อเริ่มทำ Issue ใหม่ ควรสร้าง Branch ใหม่ก่อนเริ่มเขียนโค้ด

ตัวอย่าง:

```bash
git checkout main
git pull
git checkout -b feature/2-health-check
```

จากนั้นจึงเริ่มแก้ไขโค้ด

---

# ✅ Current Project Status

ตอนนี้ Project Foundation พร้อมใช้งานแล้ว:

* React + TypeScript + Vite
* Bootstrap
* Node.js + Express + TypeScript
* PostgreSQL
* Prisma ORM
* Vitest
* Supertest
* `.env.example`
* `.gitignore`
* Frontend และ Backend แยกโฟลเดอร์เรียบร้อย

---

# 👨‍💻 สำหรับคนที่มาต่อโปรเจกต์

ถ้าเพิ่ง Clone โปรเจกต์มาใหม่ ให้ทำตามลำดับนี้:

1. `npm install` ใน `server/`
2. สร้าง `server/.env`
3. ตั้งค่า `DATABASE_URL`
4. รัน `npx prisma generate`
5. รัน `npx prisma migrate dev`
6. รัน `npm run dev` ใน `server/`
7. `npm install` ใน `client/`
8. รัน `npm run dev` ใน `client/`
9. เช็กว่า Frontend และ Backend เปิดได้
10. สร้าง Branch ของ Issue ที่กำลังจะทำ

ก่อนเริ่มแก้โค้ด แนะนำให้รัน Test ก่อน:

```bash
cd server
npm run test
```
