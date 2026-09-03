from locust import HttpUser, task, between

class WebsiteUser(HttpUser):
    wait_time = between(1, 3)

    @task(3)
    def view_dashboard(self):
        self.client.get("/api/dashboard/chairman")

    @task(2)
    def view_tasks(self):
        self.client.get("/api/tasks")

    @task(1)
    def login(self):
        self.client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password"
        })