
# **Phase 1 — AI Engineering Foundations & Development Environment**

Phase 1 · In progress

Topic 1 of 4

# **Multithreading in Python**

**Building concurrent AI applications and handling multiple operations efficiently**

Learning mode

**Production engineering**

Difficulty

**Intermediate**

Estimated time

**3–4 hours**

Primary language

**Python**

## **1. Business context — Why do AI Engineers need multithreading?**

Let's start with a real business problem rather than a Python definition.

Imagine you're developing an Enterprise AI Assistant.

A user asks:

"Analyze this customer's business profile, retrieve their recent transactions, check their support tickets, and generate a recommendation."

To answer this question, your AI application needs to call four different services:

1. Customer Profile API.
2. Transaction Database API.
3. Support Ticket API.
4. Customer Analytics API.

Assume each service takes approximately 2 seconds to respond.

**Approach A: Sequential execution**

Your application calls one service, waits for its response, then calls the next service.

**Sequential execution**

Illustrative example: four independent requests, 2 seconds each.

Customer Profile

2s

Transactions

2s

Support Tickets

2s

Analytics

2s

**Total execution time**

# **8 seconds**

**Approach B: Concurrent execution using multithreading**

Instead of waiting for one service before calling another, your application starts multiple requests concurrently.

**Concurrent execution**

The four requests are started independently.

Customer Profile

2s

Transactions

2s

Support Tickets

2s

Analytics

2s

**Total execution time**

# **\~2 seconds**

Idealized illustration assuming independent requests, sufficient capacity and negligible scheduling overhead.

The application doesn't need to wait for each independent operation to finish before starting another.

This is extremely useful in AI engineering because AI applications frequently perform:

- LLM API calls.
- Vector database searches.
- Document retrieval.
- External API requests.
- Database queries.
- File processing.
- Multiple model evaluations.

**The business value:** Lower response latency, better resource utilization and the ability to handle multiple independent operations efficiently.

## **2. Core concepts — Understand the execution model**

Before writing code, you need to understand four concepts.

### **2.1 What is a thread?**

A thread is an execution unit inside a process.

A Python process can contain multiple threads that share the same process memory.

For example:

```
Python Application (Process)
│
├── Main Thread
│    └── Handles incoming requests
│
├── Worker Thread 1
│    └── Calls OpenAI API
│
├── Worker Thread 2
│    └── Queries PostgreSQL
│
├── Worker Thread 3
│    └── Calls Customer API
│
└── Worker Thread 4
     └── Retrieves documents
```

All these threads belong to the same process.

They can execute different tasks concurrently while sharing process resources.

### **2.2 Process vs. thread**

This distinction is important for production engineering.

| Feature           | Process                     | Thread                             |
| ----------------- | --------------------------- | ---------------------------------- |
| Memory            | Separate address space      | Shared process memory              |
| Creation overhead | Generally higher            | Generally lower                    |
| Communication     | IPC mechanisms              | Shared objects and synchronization |
| Isolation         | Stronger                    | Less isolation                     |
| Failure impact    | Usually isolated to process | Can affect the entire process      |
| Best suited for   | CPU-heavy workloads         | I/O-heavy workloads                |

Example:

- Process: Run an independent document-processing worker.
- Thread: Make multiple API calls concurrently.

### **2.3 Concurrency vs. parallelism**

These terms are often confused.

**Concurrency:** Multiple tasks make progress during overlapping periods. They don't necessarily execute at exactly the same instant.

**Parallelism:** Multiple tasks actually execute simultaneously, typically on different CPU cores.

[Concurrency vs. Parallelism, Processes vs. Threads, Building Thread-Safe Systems | by Alina Kovtun✨ | Women in Technology | Mar, 2026 | Medium](https://images.openai.com/static-rsc-4/0QXoOSqi9m4xNIPjqgMOT0FNfWt-oGgrkeLZY6PvfpmChwWMYjyPS5LKNfhSaPTkTQEBqQJ52Pxdief6NbitCa-wChqm6-I7_4RGkJmZv_0f8nCAma4DNDI94Thpqmoe5D3FFY88XfKCGkeeRD-WAlr8Zk2jClZtPwOxfwv5lCc?purpose=inline)

[medium.com](https://medium.com/%40akovtun/concurrency-parallelism-processes-threads-thread-safe-systems-1d4e7d351824?utm_source=chatgpt.com)

Think about a restaurant:

- Concurrency: One waiter manages several tables, switching between them while waiting for food preparation.
- Parallelism: Multiple waiters serve different tables at the same time.

Multithreading is particularly useful for concurrent I/O operations.

### **2.4 The Python GIL**

This is a concept you absolutely need to understand.

GIL stands for Global Interpreter Lock.

In standard CPython builds, the GIL generally allows only one thread at a time to execute Python bytecode within a process.

Does this mean multithreading is useless?

Absolutely not.

Consider an API request:

1. Python sends an HTTP request.
2. The remote server processes it.
3. Python waits for the response.
4. Python receives the response.

During the waiting period, the thread is blocked on I/O. CPython can release the GIL, allowing other threads to execute.

That's why multithreading is effective for network and database operations.

| Workload                           | Preferred approach                            |
| ---------------------------------- | --------------------------------------------- |
| Calling multiple LLM APIs          | Multithreading or asyncio                     |
| Calling multiple REST APIs         | Multithreading or asyncio                     |
| Downloading multiple files         | Multithreading or asyncio                     |
| Heavy image processing             | Multiprocessing or native optimized libraries |
| CPU-heavy Python calculations      | Multiprocessing                               |
| Large concurrent network workloads | Usually asyncio                               |

One advanced detail: free-threaded CPython builds are available in newer Python versions, but they are an optional configuration with compatibility and performance considerations. Don't assume every Python installation has removed the GIL.

## **3. Architecture — How multithreading works in Python**

Python provides several ways to work with threads. For our engineering applications, the most important one is:

`concurrent.futures.ThreadPoolExecutor`

It manages a pool of worker threads so that you don't have to manually create and manage every thread.

### **3.1 ThreadPoolExecutor architecture**

[Threads In Python Presentation (Download Slides)](https://images.openai.com/static-rsc-4/zsSswuTFwBIIRAFbhkzVdRLV0f2vqiAlfHFuOYsVF8CKi0X4Ifxu8x6dFPZNaOMx3Q9DTHCCO0Ht_GLQIEpYu107Dhdgl0X42Q9YSNhT5rhegmWelpM_1R0WVRKhI0fUgjaNhzBhCHBQpI9XMqfB9LaHhGhbE3cb1vK7zBFitjg?purpose=inline)

[slidemake.com](https://www.slidemake.com/presentation/Threads-in-python-64d28fc882db6478d9c49e9f?utm_source=chatgpt.com)

Understand the flow:

1. Main thread receives a task.
2. Main thread submits tasks to the executor.
3. Tasks enter the executor's work queue.
4. Available worker threads pick up tasks.
5. Each worker executes its assigned task.
6. Results are returned through Future objects.
7. Main thread collects the results.

A `Future` represents the eventual result of an operation that has been submitted but may not have completed yet.

### **3.2 The important components**

| Component          | Responsibility                               |
| ------------------ | -------------------------------------------- |
| ThreadPoolExecutor | Manages worker threads                       |
| max_workers        | Controls the maximum number of workers       |
| submit()           | Submits a task and returns a Future          |
| map()              | Applies a function to multiple inputs        |
| Future             | Represents a pending or completed result     |
| as_completed()     | Returns futures as they finish               |
| result()           | Retrieves the result or raises its exception |
| shutdown()         | Shuts down the executor                      |

These are the APIs you'll frequently encounter in existing Python projects.

## **4. Hands-on implementation**

Let's build this progressively.

### **Example 1: Sequential execution**

First, understand the baseline.

```
import timedef process_task(task_id):    print(f"Starting task {task_id}")    time.sleep(2)  # Simulates network waiting    print(f"Completed task {task_id}")    return f"Result-{task_id}"start = time.perf_counter()results = []for i in range(1, 5):    result = process_task(i)    results.append(result)end = time.perf_counter()print("Results:", results)print("Total time:", round(end - start, 2), "seconds")
```

Expected approximate execution time:

\~8 seconds

Why? Every task must finish before the next one starts.

### **Example 2: Your first multithreading implementation**

Now let's introduce `ThreadPoolExecutor`.

```
import timefrom concurrent.futures import ThreadPoolExecutordef process_task(task_id):    print(f"Starting task {task_id}")    time.sleep(2)    print(f"Completed task {task_id}")    return f"Result-{task_id}"start = time.perf_counter()with ThreadPoolExecutor(max_workers=4) as executor:    futures = [        executor.submit(process_task, i)        for i in range(1, 5)    ]    results = [        future.result()        for future in futures    ]end = time.perf_counter()print("Results:", results)print("Total time:", round(end - start, 2), "seconds")
```

Expected approximate execution time:

\~2 seconds

What changed?

Instead of calling `process_task()` directly, we submitted it to the executor.

```
executor.submit(process_task, i)
```

This schedules the function for execution in a worker thread and immediately gives us a Future.

Then:

```
future.result()
```

Waits for the corresponding task to finish and retrieves its result.

**Important:** Although we collected results sequentially in this example, all four tasks were already running concurrently. The calls to `result()` only wait for completion; they don't start the tasks.

### **Example 3: Collect results as soon as tasks finish**

In real AI systems, different APIs have different response times.

For example:

- Customer API: 1 second.
- Vector search: 3 seconds.
- Analytics API: 2 seconds.
- LLM API: 5 seconds.

We don't want to unnecessarily wait for results in submission order.

That's why we use `as_completed()`.

```
import timefrom concurrent.futures import (    ThreadPoolExecutor,    as_completed)def process_task(task_id, delay):    print(f"Starting task {task_id}")    time.sleep(delay)    return {        "task_id": task_id,        "result": f"Data from task {task_id}",        "duration": delay    }tasks = [    (1, 2),    (2, 5),    (3, 1),    (4, 3)]with ThreadPoolExecutor(max_workers=4) as executor:    future_to_task = {        executor.submit(process_task, task_id, delay): task_id        for task_id, delay in tasks    }    for future in as_completed(future_to_task):        task_id = future_to_task[future]
```

The output order will be based on completion, not submission order.

This pattern is especially useful when you're collecting responses from multiple independent services.

## **5. Real-world AI engineering implementation**

Now let's apply multithreading to an actual AI business requirement.

### **Business requirement: Parallel customer intelligence**

Your application must retrieve information from four independent services before asking an LLM to generate a recommendation.

**AI customer intelligence pipeline**

**Incoming customer request**

**ThreadPoolExecutor**

Four concurrent data retrieval tasks

**Profile API**

Customer details

**Transaction API**

Purchase history

**Support API**

Support tickets

**Analytics API**

Customer metrics

**Aggregate and validate results**

**LLM recommendation engine**

**Business recommendation**

### **Production-style implementation**

Install the HTTP client:

```
pip install httpx
```

Here is a reusable service pattern. The URLs below are placeholders for your company's APIs.

```
import timeimport loggingfrom concurrent.futures import (    ThreadPoolExecutor,    as_completed)import httpxlogging.basicConfig(level=logging.INFO)logger = logging.getLogger(__name__)API_URLS = {    "profile": "https://company.example/api/profile",    "transactions": "https://company.example/api/transactions",    "support": "https://company.example/api/support",    "analytics": "https://company.example/api/analytics",}def fetch_service(client, service, customer_id):    url = API_URLS[service]    response = client.get(        url,        params={"customer_id": customer_id}    )    response.raise_for_status()    return response.json()def collect_customer_data(customer_id):
```

### **Let's understand the engineering decisions**

**Decision 1: Why did we use&#x20;**`max_workers=4`**?**

We have four independent services. Four workers allow all four requests to be in progress concurrently.

**Decision 2: Why did we use&#x20;**`httpx.Client`**?**

It provides connection pooling and allows us to reuse an HTTP client instead of creating a new connection for every request.

**Decision 3: Why did we use&#x20;**`as_completed()`**?**

We can process each response immediately after it completes.

**Decision 4: Why did we use&#x20;**`try/except`**&#x20;around&#x20;**`future.result()`**?**

One service might fail while others succeed. We don't want one failed request to prevent us from collecting all other results.

**Decision 5: Why did we add a timeout?**

An external service might become unresponsive. Without a timeout, your application could wait indefinitely.

Notice that we are not treating missing information as valid customer data. Before generating a recommendation, the business logic must decide whether missing services are acceptable or whether the operation should fail.

## **6. Production engineering — What can go wrong?**

Knowing how to write a multithreading program is not enough. You need to understand its failure scenarios.

| Failure scenario       | Engineering solution                      |
| ---------------------- | ----------------------------------------- |
| API takes too long     | Connection and read timeouts              |
| API returns 429        | Rate limiting and retry with backoff      |
| API returns 500        | Controlled retries and fallback           |
| Too many threads       | Worker limits and bounded task submission |
| Shared data corruption | Locks or thread-safe data structures      |
| Deadlock               | Avoid circular waits and nested blocking  |
| Duplicate requests     | Idempotency keys and deduplication        |
| Service unavailable    | Circuit breaker and fallback              |
| One task fails         | Isolate exceptions per Future             |

### **6.1 Thread safety**

Because threads share memory, they can modify the same Python object.

Consider:

```
counter = 0def increment():    global counter    for _ in range(100000):        counter += 1
```

If multiple threads modify shared state, you need to consider race conditions.

A race condition occurs when the correctness of the result depends on the timing of concurrent operations.

Python provides `threading.Lock()` to protect critical sections.

```
import threadingfrom concurrent.futures import ThreadPoolExecutorcounter = 0counter_lock = threading.Lock()def increment():    global counter    for _ in range(100000):        with counter_lock:            counter += 1with ThreadPoolExecutor(max_workers=5) as executor:    futures = [        executor.submit(increment)        for _ in range(5)    ]    for future in futures:        future.result()print("Final counter:", counter)
```

Expected output:

```
Final counter: 500000
```

The lock ensures that only one thread at a time can execute the protected increment operation.

**Production advice:** Don't put a lock around everything. It can eliminate the concurrency benefits. Prefer independent task data, immutable objects and minimal shared mutable state.

### **6.2 Thread pool sizing**

Should you always use 100 threads?

No.

More threads don't automatically mean better performance.

Too many threads can create:

- Excessive context switching.
- Connection pool exhaustion.
- Memory overhead.
- API rate-limit violations.
- Database connection exhaustion.
- Increased contention.

A good starting point for an I/O-heavy workload is a small bounded pool, then measure performance and adjust it according to service limits and concurrency requirements.

### **6.3 Multithreading vs. asyncio — When should you choose each?**

This is an especially important decision for modern AI engineering.

| Requirement                           | Recommendation              |
| ------------------------------------- | --------------------------- |
| Existing synchronous AI SDK           | ThreadPoolExecutor          |
| Multiple blocking REST APIs           | ThreadPoolExecutor          |
| Large number of concurrent HTTP calls | asyncio + HTTPX AsyncClient |
| Async database driver                 | asyncio                     |
| Synchronous third-party library       | ThreadPoolExecutor          |
| CPU-heavy Python computation          | Multiprocessing             |

Remember: we are not learning asyncio in this topic. That is a separate topic in Phase 1.

## **7. Senior-level engineering interview questions**

These questions are useful when discussing Python concurrency in AI engineering interviews.

**Q1. Why would you use multithreading instead of multiprocessing for an AI application that calls multiple LLM APIs?**

**Answer:**

LLM API requests are predominantly I/O-bound. Most of the execution time is spent waiting for remote API responses rather than performing CPU-intensive Python calculations.

Multithreading allows independent requests to progress concurrently while other threads wait for network responses.

Multiprocessing would introduce additional process-management and memory overhead without necessarily improving this workload.

For high-concurrency applications, I would also evaluate asyncio, especially when the SDKs support asynchronous execution.

**Q2. What happens if one thread fails while other threads are executing?**

**Answer:**

A worker exception is generally captured in its associated Future. The exception is raised when the application retrieves the result using `future.result()`.

I would isolate exceptions for individual tasks, log failures with request identifiers, implement appropriate retries and decide whether the business operation can continue with partial results.

**Q3. How would you prevent an AI application from overwhelming an external API when using multithreading?**

**Answer:**

I would implement:

1. Bounded worker pools.
2. API-specific concurrency limits.
3. Rate limiting.
4. Exponential backoff with jitter for retryable failures.
5. Request timeouts.
6. Circuit breakers for persistent failures.
7. Monitoring of latency, throughput and error rates.

I would also ensure retries are safe and do not create duplicate business operations.

## **8. Practical assignment — Build your own concurrent AI data retriever**

Required before moving forward

Now I want you to implement something independently.

### **Business scenario**

You are developing an AI customer-support assistant. Before answering a user's question, it must retrieve information from five independent services.

| Service   | Operation           |
| --------- | ------------------- |
| Service A | Customer profile    |
| Service B | Transaction history |
| Service C | Support tickets     |
| Service D | Product information |
| Service E | Customer analytics  |

### **Requirements**

- Implement a sequential version.
- Implement a multithreaded version.
- Use `ThreadPoolExecutor`.
- Use `max_workers=5`.
- Collect results using `as_completed()`.
- Handle individual task failures.
- Implement a timeout.
- Log successful and failed operations.
- Compare sequential and concurrent execution times.
- Generate one consolidated JSON response.

### **Expected architecture**

```
Customer Request
      |
      v
Concurrent Data Retriever
      |
      +---- Customer Profile
      |
      +---- Transactions
      |
      +---- Support Tickets
      |
      +---- Product Information
      |
      +---- Analytics
      |
      v
Result Aggregation
      |
      v
Validated JSON Response
      |
      v
Ready for LLM Processing
```

**Deliverable:** A GitHub-ready Python project with source code, README, execution screenshots or logs, and performance comparison.

## **9. Knowledge validation**

Before we move to Topic 2, answer these questions. I want to check whether you understand the engineering decisions, not just Python syntax.

**Topic 1 assessment**

0/5 answered

**1. Why is multithreading particularly useful when calling multiple LLM APIs?**

It makes every API execute on a separate CPU core

It allows other requests to progress while threads wait for network responses

It removes API rate limits

It eliminates network latency

**2. What does ThreadPoolExecutor.submit() return?**

A thread ID

A JSON response

A Future object

A process

**3. What is the main difference between concurrency and parallelism?**

They mean exactly the same thing

Concurrency means overlapping progress; parallelism means simultaneous execution

Concurrency only works with processes

Parallelism only works with Python threads

**4. Why do we use as_completed()?**

To restart failed threads

To retrieve futures in completion order

To increase CPU cores

To automatically retry requests

**5. What should you do if an external API starts returning HTTP 429?**

Increase the number of threads

Retry immediately without limits

Use rate limiting and backoff

Disable all timeouts

Submit answers

## **10. Our Phase 1 progress tracker**

## **Python for AI Engineering**

1. **Topic 1 — Multithreading**

   Teaching started

   ThreadPoolExecutor, Futures, concurrency, GIL, thread safety
2. **Topic 2 — Multiprocessing**

   ProcessPoolExecutor, CPU-bound workloads, IPC, process management
3. **Topic 3 — Decorators**

   Wrappers, closures, reusable functions, retry and logging decorators
4. **Topic 4 — Asynchronous Programming**

   asyncio, async/await, event loop, HTTPX AsyncClient, concurrency limits

Next phase: LLM Engineering & Model Integration

**Your learning rule:** We will not move to the next topic just because we've finished explaining it. First, you should understand the architecture, complete the practical implementation and demonstrate your understanding.

For now, complete the assessment and assignment. I'll review your answers and code like a senior AI engineer reviewing a junior engineer's implementation.
