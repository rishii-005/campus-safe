
# 🛡️ Campus Safe
### Campus Emergency Assistance and Incident Coordination Platform

Campus Safe is a full-stack emergency management platform designed to improve campus safety through real-time SOS alerts, incident reporting, department coordination, and emergency response tracking.

The platform connects students, security personnel, wardens, medical staff, and administrators through a centralized system to ensure faster communication and better incident management.

---

## 🚀 Key Features

### 1. Public Emergency SOS
- One-click emergency reporting without login.
- Emergency categories: Medical, Fire, Accident, and Harassment / Women Safety.
- GPS-based location sharing when available.
- Unique emergency reference numbers.
- Emergency cancellation and live status tracking.

### 2. Student Portal
- Secure student registration and login.
- Submit complaints and incident reports.
- Upload images and documents as evidence.
- Track complaint status and updates.
- Receive real-time notifications.

### 3. Security Management
- Real-time emergency notifications.
- Acknowledge and coordinate incidents.
- Assign available responders.
- Track emergency response progress.
- Communicate with response teams.

### 4. Department Management
- Dedicated Warden and Medical dashboards.
- Department-based incident routing.
- Role-based access permissions.
- Incident assignment and resolution tracking.

### 5. Admin Dashboard
- Centralized campus incident management.
- User and department management.
- Analytics and date-based filtering.
- CSV and PDF report exports.
- Emergency routing configuration.
- Audit logs and escalation settings.

### 6. Real-Time Communication
- Socket.IO-based notifications.
- Live incident status updates.
- Team messaging.
- Persistent notification storage.

### 7. Emergency Simulation
- Practice emergency response scenarios.
- Simulated incident coordination.
- Performance scorecards.
- No real emergency alerts are generated during simulations.

---

## 🧰 Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React 19, Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL |
| Database Hosting | Neon |
| Real-Time Communication | Socket.IO |
| Authentication | JWT, bcrypt |
| Security | Helmet, Express Rate Limit |
| File Uploads | Multer |
| Testing | Automated API / E2E Tests |
| Version Control | Git, GitHub |

---

## 🏗️ System Architecture

```text
              USERS
                |
       React + Vite Frontend
                |
          HTTP / REST API
                |
       Node.js + Express
                |
      ---------------------
      |         |         |
   Auth      Routes    Services
      |         |         |
      ---------------------
                |
          PostgreSQL
                |
             Neon

       Socket.IO Notifications
                |
        Real-Time Updates
```

The frontend communicates with the backend through REST APIs, while Socket.IO handles real-time communication. PostgreSQL stores application data, incidents, notifications, and related records.

---

## 📂 Project Structure

```text
campus-safe/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── ...
│   ├── package.json
│   └── ...
│
├── server/
│   ├── db/
│   │   ├── schema.sql
│   │   ├── migrate.js
│   │   └── seed.js
│   │
│   ├── src/
│   │   ├── index.js
│   │   ├── auth.js
│   │   ├── services.js
│   │   ├── notify.js
│   │   └── routes/
│   │
│   └── ...
│
├── package.json
├── README.md
└── .gitignore
```

---

## ⚙️ Installation and Setup

### Prerequisites

Make sure you have installed:

- Node.js 20 or newer
- npm
- PostgreSQL database
- Git

A Neon PostgreSQL database or local PostgreSQL installation can be used.

### 1. Clone the Repository

```bash
git clone https://github.com/rishii-005/campus-safe.git

cd campus-safe
```

### 2. Install Dependencies

```bash
npm run install:all
```

### 3. Configure Environment Variables

Create the server environment file:

```bash
cp server/.env.example server/.env
```

On Windows PowerShell, you can also use:

```powershell
Copy-Item server/.env.example server/.env
```

Configure the following important variables in `server/.env`:

| Variable | Description |
|---|---|
| DATABASE_URL | PostgreSQL connection string |
| JWT_SECRET | Strong secret for JWT authentication |
| DATABASE_SSL | Database SSL configuration |

For Neon, keep `?sslmode=require` in the database connection string.

For local PostgreSQL without SSL, configure `DATABASE_SSL=false`.

Never commit your actual `.env` files or credentials.

### 4. Initialize the Database

```bash
npm run db:setup
```

This creates the database tables and inserts development seed data.

### 5. Start the Application

Open two terminals.

**Terminal 1 – Backend**

```bash
npm run dev:server
```

Backend:

```text
http://localhost:5000
```

**Terminal 2 – Frontend**

```bash
npm run dev:client
```

Frontend:

```text
http://localhost:5173
```

Open the frontend URL in your browser.

---

## 🔐 Demo Credentials

The following development accounts are created through the database seed process.

**Development password:** `Password@123`

| Role | Email |
|---|---|
| Super Admin | admin@campus.test |
| Security | security@campus.test |
| Security Responder | security2@campus.test |
| Warden | warden@campus.test |
| Medical Staff | medical@campus.test |
| Medical Staff | medical2@campus.test |
| Student | student@campus.test |

**Important:** These are public development credentials, not production credentials. Change or remove demo accounts before deploying the application for real users.

---

## 🔄 Main Application Workflows

### Emergency Response Workflow

```text
Student / Public User
        |
    SOS Alert
        |
  Incident Created
        |
Department Notification
        |
   Acknowledge
        |
  Responder Assigned
        |
  Responder Accepts
        |
   Status Updates
        |
  Incident Resolved
```

### Complaint Management Workflow

```text
Student Login
     |
Report Incident
     |
Upload Evidence
     |
Department Routing
     |
Staff Review
     |
Assignment
     |
Resolution
     |
Student Notification
```

---

## 🔒 Security Implementation

Campus Safe includes several security mechanisms:

- JWT-based authentication.
- Password hashing using bcrypt.
- Role-based access control.
- Server-side authorization checks.
- Parameterized SQL queries.
- Helmet security headers.
- Rate limiting for login and SOS endpoints.
- Input validation.
- Restricted evidence file downloads.
- Randomized uploaded file names.
- Protection against duplicate emergency alerts.
- CSV formula injection protection.
- Server-controlled Socket.IO room access.

---

## 🧪 Testing

The project includes automated API end-to-end tests covering approximately 70 checks.

Test coverage includes:

- Authentication and authorization.
- Emergency SOS alerts.
- Incident reporting.
- Department permissions.
- Evidence uploads.
- Responder assignments.
- Notifications.
- Incident cancellation.
- Escalation.
- Simulation workflows.
- Report exports.

Run the tests with:

```bash
npm run test:api
```

The server should be running against a properly seeded database.

Login and emergency endpoints are rate-limited, so allow time between repeated test runs.

---

## 🚀 Production Build

Build the frontend:

```bash
npm run build
```

Start the application:

```bash
npm start
```

For production deployment:

- Set `NODE_ENV=production`.
- Configure a strong `JWT_SECRET`.
- Set the correct `CLIENT_ORIGIN`.
- Configure `TRUST_PROXY=true` when behind a trusted proxy.
- Use HTTPS.
- Use persistent storage or cloud storage for uploaded files.

---

## ⚠️ Current Limitations

- Password reset email delivery is not implemented.
- Uploaded files are stored on local disk.
- Login tokens are stored in browser localStorage.
- GPS location updates depend on the confirmation page remaining open.
- The guidance assistant uses predefined FAQ content rather than an LLM.
- Real emergency services are not contacted.
- The application must undergo additional browser and production testing before real-world deployment.

Campus Safe is an academic software project and should not be used as the sole emergency response system.

---

## 🔮 Future Improvements

- Email-based password recovery.
- Cloud-based evidence storage.
- Enhanced location visualization.
- Push notifications.
- Improved mobile experience.
- Advanced incident analytics.
- Stronger production security.
- Comprehensive browser-based testing.

---

## 📸 Screenshots

Screenshots of the application will be added here.

Suggested screenshots:

- Public SOS Homepage
- Student Dashboard
- Security Dashboard
- Admin Dashboard
- Incident Details
- Emergency Simulation Centre

---

## 📄 License

This project is licensed under the MIT License.

See the `LICENSE` file for more information.

---

## 👨‍💻 Developer

**Rishi Raj**

Computer Science Engineering Student

Lovely Professional University

GitHub: [@rishii-005](https://github.com/rishii-005)

Project Repository: [Campus Safe](https://github.com/rishii-005/campus-safe)

---

⭐ If you find this project interesting, consider giving the repository a star!
