# Backend Service (FastAPI)

This repository contains the backend service built using **FastAPI**.

Follow the steps below to set up the virtual environment, install dependencies, and run the application.

---

## 1. Create and Activate Virtual Environment

### MacOS / Linux
```bash
python3 -m venv venv
source venv/bin/activate
```
### Windows
```bash
python -m venv venv
venv\Scripts\activate
```
## 2. Install Required Packages
### Install dependencies using:

```bash
pip install -r requirements.txt
```
### If you add or update packages, refresh the file:

```bash
pip freeze > requirements.txt
```

## 3. Run the Application
### Start the FastAPI server using Uvicorn:
```bash
uvicorn app.main:app --reload --port 8000
```

### The application will be available at:
```bash
http://localhost:8000
```

## 4. API Documentation
### FastAPI automatically generates interactive documentation.
## Swagger UI
```bash
http://localhost:8000/docs
```

