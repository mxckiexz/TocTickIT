
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
| **Administrator** | จัดการผู้ใช้ (สร้าง/แก้ไข/ระงับ/รีเซ็ตรหัสผ่าน), **ดู** ticket ได้อย่างเดียว (read-only) — **เปลี่ยนใน Lab 4:** ทำกับ ticket ได้เหมือน IT Staff ดูหัวข้อ Lab 4 |

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

# 🧭 Lab 4 — Actions Taken, Workflow และ Dashboard

Lab 4 เพิ่ม 3 อย่างโดยที่ Lab 1 ถึง 3 ยังทำงานครบ และอยู่ใต้ธีม Zen Green เดิม:

| ส่วน | สิ่งที่ได้ |
|---|---|
| **Actions Taken** | บันทึกสิ่งที่ทำกับ ticket ได้หลายรายการ (สถานะ Planned / In progress / Completed / Cancelled, ผู้รับผิดชอบ, ผลลัพธ์, follow-up) แก้ได้แต่ลบไม่ได้ ทุกการแก้เก็บเป็น revision (append-only) Requester เห็นแบบอ่านอย่างเดียว |
| **Ticket workflow** | ตารางสถานะ 8 สถานะและ **resolution gate** บังคับที่ backend (Resolved ต้องมี owner, มี action ที่ Completed อย่างน้อย 1 รายการ และไม่มี action ที่ยัง Planned / In progress) ปุ่มสถานะแสดงเฉพาะที่ย้ายได้ และมี optimistic locking ด้วย `version` (ส่ง version เก่า = `409`, UI ขึ้นแบนเนอร์ + ปุ่ม Reload) |
| **Dashboard ตามบทบาท** | Requester: ticket ที่เปิดอยู่ / รอคุณ / อัปเดตล่าสุด / แก้แล้วล่าสุด · IT Staff และ Administrator: Unassigned, Assigned to me, Open actions assigned to me, ตามสถานะ, ตาม IT priority, ล่าสุด, My recent actions (Administrator เห็นจำนวนผู้ใช้เพิ่ม) ทุกตัวเลขเป็นลิงก์ไปรายการที่นับ (เวลา Asia/Bangkok, 7 วันล่าสุด) |

**สิ่งที่เปลี่ยนจาก Lab 3:** ทุกบทบาทเข้าหน้า **Dashboard** ก่อน เมนูหลักมีแถวเดียวตามบทบาท (Requester: Dashboard, New Ticket, My Tickets · IT Staff: Dashboard, Ticket Queue · Administrator: Dashboard, Ticket Queue, User Management) และ **Administrator ทำกับ ticket ได้เหมือน IT Staff** (claim, assign, priority, สถานะ, คอมเมนต์, note, Actions Taken) แต่ยังเป็นคนเดียวที่จัดการผู้ใช้ได้ หน้าต่าง ๆ อยู่ใน URL hash เช่น `#/queue?ownerId=unassigned&open=1` จึงเปิดในแท็บใหม่และกดปุ่ม Back ได้

### ลองใช้ (demo)

ใช้บัญชี seed ของ Lab 3 ด้านบน (รหัสผ่านเริ่มต้นเปลี่ยนตอน Login ครั้งแรก) หลัง `npm run prisma:seed` จะมี Actions Taken ตัวอย่างบน `TKT-SEED-002` ถึง `011` ครบทั้ง 0 / 1 / หลายรายการ และมี action ที่ยังเปิดอยู่ที่มอบหมายให้ **Marcus Chen** กับ **Olivia Martinez** — Login ด้วย `marcus.chen@toktickit.test` แล้วการ์ด "Open actions assigned to me" จะไม่เป็นศูนย์ ส่วน `priya.nair@toktickit.test` การ์ดนี้ยังเป็นศูนย์พร้อมข้อความ "Nothing here"

ลำดับที่แนะนำ: IT Staff เปิด ticket → เพิ่ม Actions Taken (ลองบันทึก Completed โดยไม่ใส่ Result เพื่อดู validation) → ลองกด Resolved ตอนยังมี action ค้าง (ปุ่มถูกปิดพร้อมเหตุผล) → ทำ action ให้เสร็จ → Resolved → Requester Login ดู ticket เดียวกัน (อ่านอย่างเดียว) และกด "Problem Appears Resolved" (สถานะไม่เปลี่ยน)

# 🧰 Lab 4 — Actions Taken: Migration, Rollback และ Seed

Migration `20261012090000_lab4_actions_taken` เป็นแบบ **เพิ่มอย่างเดียว** (additive): เพิ่ม enum `ActionStatus`, ตาราง `ActionTaken` และ `ActionTakenRevision`, และคอลัมน์ `Ticket.version` (default 1) ไม่แก้และไม่ลบอะไรของ Lab 1 ถึง 3

### Migrate

```bash
cd server
pg_dump -Fc "$DATABASE_URL" -f ../before_lab4.dump   # สำรองก่อนเสมอ
npx prisma migrate deploy                            # ใช้ migration ของ Lab 4
npm run prisma:seed                                  # เพิ่ม Actions Taken ตัวอย่างบน TKT-SEED-002 ถึง 011
```

### Rollback

ทางที่ 1: **restore จาก dump** (ใช้ได้เสมอ แม้มีข้อมูล Action Taken แล้ว):

```bash
dropdb toktickit && createdb toktickit
pg_restore -d toktickit ../before_lab4.dump
```

ทางที่ 2: **SQL ย้อนกลับ** (ปลอดภัยเฉพาะก่อนมีข้อมูลใน `ActionTaken`; ถ้ามีแล้วข้อมูลจะหาย):

```sql
DROP TABLE "ActionTakenRevision";
DROP TABLE "ActionTaken";
DROP TYPE "ActionStatus";
ALTER TABLE "Ticket" DROP COLUMN "version";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261012090000_lab4_actions_taken';
```

ทั้งสองทางทดสอบจริงบนฐานข้อมูลสำเนา (`toktickit_f2_scratch`, ลบทิ้งแล้ว): สำเนาที่เป็นสถานะ Lab 3 มี 23 tickets, หลัง `migrate deploy` ยังมี 23 tickets และ `version` เป็น 1 ทุกแถว, หลัง SQL ย้อนกลับไม่มีตารางและไม่มีคอลัมน์ `version`, หลัง restore จาก dump `prisma migrate status` รายงานว่า migration ของ Lab 4 ยังไม่ถูกใช้ นอกจากนี้ `server/tests/lab-04/migration.api.test.ts` เล่น SQL ของ migration และ SQL ย้อนกลับซ้ำใน schema ชั่วคราวแล้ว rollback ทุกครั้ง

### เทสต์ที่เกี่ยวข้อง

```bash
cd server && npx vitest run tests/lab-04/migration.api.test.ts tests/lab-04/seed.api.test.ts
```

---

### รันเทสต์ทั้งหมด (Lab 1 ถึง 4)

รันทีละชุด **ห้ามรันพร้อมกัน** เพราะทุกชุดใช้ฐานข้อมูล PostgreSQL ตัวเดียวกัน (Playwright ก็ใช้ฐานข้อมูลเดียวกันและรีเซ็ต fixture ให้เองก่อนรัน):

```bash
cd server && npm test           # Vitest + Supertest: API, authorization, migration, seed, concurrency (26 ไฟล์, 553 เทสต์)
cd client && npm test           # Vitest + React Testing Library (20 ไฟล์, 291 เทสต์)
npm run test:e2e                # Playwright จาก root, เปิด server + client ให้เอง (102 เทสต์)
npx playwright test e2e/lab-04  # เฉพาะ Lab 4: Actions Taken, resolution, dashboards, a11y, responsive (64 เทสต์)
```

หมายเหตุ:

* Playwright เรียก `server/scripts/e2e-fixture.ts` ให้เองก่อนรัน: สร้างบัญชีทดสอบ `e2e-*@toktickit.test` (รหัสผ่านทดสอบอยู่ในสคริปต์นั้น ใช้ local เท่านั้น) และลบ ticket ที่ขึ้นต้นด้วย `[e2e]` ของรอบก่อน จึงรันซ้ำได้
* ตัวเลขใน dashboard ถูกเทียบกับฐานข้อมูลด้วย `npm run e2e:truth -- <อีเมล>` (ใน `server/`) ซึ่งคำนวณจาก SQL เอง ไม่ใช้โค้ด dashboard
* Playwright เขียนภาพ screenshot ใหม่ทุกครั้งที่รัน (`artifacts/lab-02`, `lab-03`, `lab-04`) ภาพมีเวลาอยู่ในหน้าจอ จึงเปลี่ยนทุกรอบ ถ้าไม่ได้ตั้งใจอัปเดตหลักฐาน ให้ `git checkout -- artifacts` ก่อน commit
* ยังไม่มี CI: ผลทดสอบทุกตัวมาจากการรันบนฐานข้อมูล local

### เอกสารและหลักฐานของ Lab 4

| อะไร | อยู่ที่ไหน |
|---|---|
| Specification, API, UI, Test plan (ตารางตาม AC / BR / FR) | `docs/lab-04/specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md` |
| บันทึกรีวิว PR ทุกตัว (ข้อความจริงจาก GitHub) | `docs/lab-04/reviewer.md` |
| การใช้ AI (prompts + My Reflection) | `docs/lab-04/ai-use.md` |
| Screenshot 3 ขนาด (1280 / 768 / 375): staff-dashboard, requester-dashboard, actions-taken | `artifacts/lab-04/screenshots/` |
| Output ของเทสต์ | `docs/lab-04/test-output/` |
| แผนที่หลักฐานเทียบกับใบงาน (Part 1 ถึง 9 และสิ่งที่ยังเปิดอยู่) | `docs/lab-04/evidence.md` |

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

### Lab 4

Lab 4 ใช้ `feature/*` → PR → **`lab4-staging`** → (เมื่อเทสต์ผ่านทั้งหมด) PR `release/lab4` → **`main`** ไม่ push ตรงเข้า `main` ทุก PR ใส่ `Closes #<issue>` และผ่านการรีวิว (บันทึกใน `docs/lab-04/reviewer.md`)

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
* Lab 4: Actions Taken, status matrix + resolution gate, optimistic locking, Dashboard ตามบทบาท, a11y และ responsive 375 / 768 / 1280 — ดูหัวข้อ "Lab 4" ด้านบน

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
