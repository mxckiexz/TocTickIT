
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

# 🔑 Lab 3 — Authentication, Roles และ Seed Data

Lab 3 เปลี่ยนจาก dev-selector ของ Lab 2 เป็นระบบ Login จริง (session cookie แบบ HttpOnly) และมี 3 บทบาท:

| Role | ทำอะไรได้ |
|---|---|
| **Requester** | สร้าง/ดู ticket ของตัวเอง, คอมเมนต์, กด "Problem Appears Resolved" |
| **IT Staff** | ดู Ticket Queue, claim/assign, ตั้ง IT Priority, เปลี่ยนสถานะ, คอมเมนต์ และเขียน Internal Note |
| **Administrator** | จัดการผู้ใช้ (สร้าง/แก้ไข/ระงับ/รีเซ็ตรหัสผ่าน), **ดู** ticket ได้อย่างเดียว (read-only) |

### บัญชีสำหรับทดลอง (Seed accounts)

> ⚠️ **ใช้สำหรับ local development เท่านั้น** — เป็นข้อมูลทดสอบ ไม่ใช่รหัสผ่านจริง
> ทุกบัญชีใช้รหัสผ่านเริ่มต้นเดียวกันคือ `ChangeMe123!` (ตั้งค่าได้ด้วย `SEED_DEFAULT_PASSWORD` ใน `server/.env`)
> และถูกบังคับให้เปลี่ยนรหัสผ่านทันทีที่ Login ครั้งแรก

| Role | อีเมล | สถานะ |
|---|---|---|
| Administrator | `grace.thompson@toktickit.test` | Active |
| IT Staff | `priya.nair@toktickit.test` | Active |
| IT Staff | `marcus.chen@toktickit.test` | Active |
| IT Staff | `olivia.martinez@toktickit.test` | Active |
| IT Staff | `daniel.kim@toktickit.test` | Suspended (ใช้ทดสอบ Login ไม่ผ่าน) |
| Requester | `jennifer.anderson@toktickit.test` | Active |
| Requester | `michael.brown@toktickit.test` | Active |
| Requester | `sarah.johnson@toktickit.test` | Active |
| Requester | `david.lee@toktickit.test` | Active |
| Requester | `emily.carter@toktickit.test` | Suspended |

ถ้าเคยเปลี่ยนรหัสผ่านของบัญชีไปแล้ว การรัน seed ซ้ำ **จะไม่รีเซ็ตรหัสผ่านกลับ** (seed ใช้ `upsert`) — ให้ใช้หน้า User Management ของ Administrator รีเซ็ตแทน

### สร้างข้อมูลเริ่มต้น

```bash
cd server
npm run prisma:migrate   # สร้าง/อัปเดตตารางทั้งหมด (รวม migration ของ Lab 3)
npm run prisma:seed      # Category, Related System, ผู้ใช้ตัวอย่าง และ ticket ตัวอย่าง TKT-SEED-001..012
```

รันซ้ำได้อย่างปลอดภัย (idempotent) — จำนวนแถวไม่เพิ่ม ตรวจสอบโดย `server/tests/lab-03/seed.api.test.ts`

### รันเทสต์ Lab 3

รันทีละชุด **ห้ามรันพร้อมกัน** เพราะทุกชุดใช้ฐานข้อมูล PostgreSQL ตัวเดียวกัน:

```bash
cd server && npm test         # Vitest + Supertest (API / authorization / migration / seed)
cd client && npm test         # Vitest + React Testing Library (UI / style)
npm run test:e2e              # Playwright (รันจากโฟลเดอร์ root; เปิด server + client ให้เอง)
```

เอกสาร Lab 3 อยู่ที่ `docs/lab-03/` (`specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`, `reviewer.md`, `ai-use.md`) และ screenshot responsive อยู่ที่ `artifacts/lab-03/screenshots/`

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
* Lab 3: Login จริง, 3 บทบาท (Requester / IT Staff / Administrator), Ticket Queue และ Workflow ของ IT Staff, User Management ของ Administrator — ดูหัวข้อ "Lab 3" ด้านบน

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
