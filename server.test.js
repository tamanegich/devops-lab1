const request = require("supertest");
const { createApp } = require("./server");

function makePool(connOverrides = {}) {
    const conn = {
        query: jest.fn(),
        release: jest.fn(),
        ...connOverrides,
    };
    return {
        getConnection: jest.fn().mockResolvedValue(conn),
        _conn: conn,
    };
}

describe("GET /health/alive", () => {
    it("returns 200 OK (JSON)", async () => {
        const app = createApp(makePool());
        const res = await request(app)
            .get("/health/alive")
            .set("Accept", "application/json");
        expect(res.status).toBe(200);
        expect(res.body).toBe("OK");
    });

    it("returns 200 OK (HTML)", async () => {
        const app = createApp(makePool());
        const res = await request(app)
            .get("/health/alive")
            .set("Accept", "text/html");
        expect(res.status).toBe(200);
        expect(res.text).toContain("OK");
    });
});

describe("GET /health/ready", () => {
    it("returns 200 when DB is reachable", async () => {
        const pool = makePool();
        pool._conn.query.mockResolvedValue([]);
        const res = await request(createApp(pool))
            .get("/health/ready")
            .set("Accept", "application/json");
        expect(res.status).toBe(200);
        expect(res.body).toBe("OK");
    });

    it("returns 500 when DB connection fails", async () => {
        const pool = {
            getConnection: jest
                .fn()
                .mockRejectedValue(new Error("conn refused")),
        };
        const res = await request(createApp(pool))
            .get("/health/ready")
            .set("Accept", "application/json");
        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Database connection failed");
        expect(res.body.detail).toBe("conn refused");
    });
});

describe("GET /tasks", () => {
    it("returns list of tasks", async () => {
        const tasks = [
            {
                id: 1,
                title: "Buy milk",
                status: "pending",
                created_at: "2024-01-01",
            },
            {
                id: 2,
                title: "Walk dog",
                status: "done",
                created_at: "2024-01-02",
            },
        ];
        const pool = makePool();
        pool._conn.query.mockResolvedValue(tasks);
        const res = await request(createApp(pool))
            .get("/tasks")
            .set("Accept", "application/json");
        expect(res.status).toBe(200);
        expect(res.body).toEqual(tasks);
    });

    it("returns empty array when no tasks", async () => {
        const pool = makePool();
        pool._conn.query.mockResolvedValue([]);
        const res = await request(createApp(pool))
            .get("/tasks")
            .set("Accept", "application/json");
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it("returns 500 on DB error", async () => {
        const pool = makePool();
        pool._conn.query.mockRejectedValue(new Error("query failed"));
        const res = await request(createApp(pool))
            .get("/tasks")
            .set("Accept", "application/json");
        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Failed to fetch tasks");
    });

    it("returns tasks as HTML table", async () => {
        const tasks = [
            {
                id: 1,
                title: "Buy milk",
                status: "pending",
                created_at: "2024-01-01",
            },
        ];
        const pool = makePool();
        pool._conn.query.mockResolvedValue(tasks);
        const res = await request(createApp(pool))
            .get("/tasks")
            .set("Accept", "text/html");
        expect(res.status).toBe(200);
        expect(res.text).toContain("<table");
        expect(res.text).toContain("Buy milk");
    });
});

describe("POST /tasks", () => {
    it("creates a task and returns 201", async () => {
        const newTask = {
            id: 3,
            title: "New task",
            status: "pending",
            created_at: "2024-01-03",
        };
        const pool = makePool();
        pool._conn.query
            .mockResolvedValueOnce({ insertId: 3 })
            .mockResolvedValueOnce([newTask]);
        const res = await request(createApp(pool))
            .post("/tasks")
            .set("Accept", "application/json")
            .send({ title: "New task" });
        expect(res.status).toBe(201);
        expect(res.body).toEqual(newTask);
    });

    it("returns 400 when title is missing", async () => {
        const res = await request(createApp(makePool()))
            .post("/tasks")
            .set("Accept", "application/json")
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("title is required");
    });

    it("returns 400 when title is whitespace only", async () => {
        const res = await request(createApp(makePool()))
            .post("/tasks")
            .set("Accept", "application/json")
            .send({ title: "   " });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("title is required");
    });

    it("returns 500 on DB error", async () => {
        const pool = makePool();
        pool._conn.query.mockRejectedValue(new Error("insert failed"));
        const res = await request(createApp(pool))
            .post("/tasks")
            .set("Accept", "application/json")
            .send({ title: "Task" });
        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Failed to create task");
    });

    it("trims whitespace from title", async () => {
        const newTask = {
            id: 4,
            title: "Trimmed",
            status: "pending",
            created_at: "2024-01-04",
        };
        const pool = makePool();
        pool._conn.query
            .mockResolvedValueOnce({ insertId: 4 })
            .mockResolvedValueOnce([newTask]);
        const res = await request(createApp(pool))
            .post("/tasks")
            .set("Accept", "application/json")
            .send({ title: "  Trimmed  " });
        expect(res.status).toBe(201);
        expect(pool._conn.query.mock.calls[0][1]).toContain("Trimmed");
        expect(pool._conn.query.mock.calls[0][1]).not.toContain("  Trimmed  ");
    });
});

describe("POST /tasks/:id/done", () => {
    it("marks task as done and returns updated task", async () => {
        const updatedTask = {
            id: 1,
            title: "Buy milk",
            status: "done",
            created_at: "2024-01-01",
        };
        const pool = makePool();
        pool._conn.query
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([updatedTask]);
        const res = await request(createApp(pool))
            .post("/tasks/1/done")
            .set("Accept", "application/json");
        expect(res.status).toBe(200);
        expect(res.body).toEqual(updatedTask);
        expect(res.body.status).toBe("done");
    });

    it("returns 404 when task does not exist", async () => {
        const pool = makePool();
        pool._conn.query.mockResolvedValue({ affectedRows: 0 });
        const res = await request(createApp(pool))
            .post("/tasks/999/done")
            .set("Accept", "application/json");
        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Task not found");
    });

    it("returns 500 on DB error", async () => {
        const pool = makePool();
        pool._conn.query.mockRejectedValue(new Error("update failed"));
        const res = await request(createApp(pool))
            .post("/tasks/1/done")
            .set("Accept", "application/json");
        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Failed to update task");
    });

    it("returns done task as HTML", async () => {
        const updatedTask = {
            id: 1,
            title: "Buy milk",
            status: "done",
            created_at: "2024-01-01",
        };
        const pool = makePool();
        pool._conn.query
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([updatedTask]);
        const res = await request(createApp(pool))
            .post("/tasks/1/done")
            .set("Accept", "text/html");
        expect(res.status).toBe(200);
        expect(res.text).toContain("done");
    });
});
