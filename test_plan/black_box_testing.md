# Comprehensive Test Plan - Black-Box Testing

This document serves as the master specification for black-box (functional) testing design. It defines systematic strategies to design test suites from specifications without inspecting source code.

---

## 1. Exhaustive vs. Random Testing Limits

### Why Exhaustive Testing is Mathematically Infeasible
Exhaustive testing is mathematically impossible for even simple functions. Consider a basic function:
```c
void printSum(int a, int b);
```
Assuming standard 32-bit integers, the input domain $D$ consists of all pairs of 32-bit integers:
* **Size of Domain**: $2^{32} \times 2^{32} = 2^{64}$ combinations.
* **Calculations**:
  $$2^{64} \approx 1.84 \times 10^{19} \text{ test cases}$$
  Assuming a hyper-fast testing harness capable of executing **1 test case per nanosecond** ($10^9$ tests per second):
  $$\text{Time Required} = \frac{1.84 \times 10^{19} \text{ tests}}{10^9 \text{ tests/sec}} = 1.84 \times 10^{10} \text{ seconds}$$
  $$\text{Time Required in Years} = \frac{1.84 \times 10^{10} \text{ seconds}}{31,536,000 \text{ seconds/year}} \approx 584.9 \text{ years}$$
Thus, exhaustive testing is physically impossible.

### Why Random Testing is Inefficient
* **Designer Bias**: The risk that the same misunderstandings or assumptions shape both the code and the tests. This is severe when the same person writes both, leading them to miss testing the same boundary conditions they forgot in code.
* **Sparse Fault Distribution**: Bugs are typically sparse across the infinite input domain space. Scattering random test cases behaves like finding needles in a haystack. 
* **The Solution**: Failures are sparse globally, but highly **dense within specific subdomains**. Partition testing divides the domain into these homogeneous subdomains and targets them systematically.

---

## 2. Equivalence Partitioning & Boundary Value Analysis (BVA)
To exploit the subdomain density of bugs:
1. Divide the input domain into **Equivalence Classes (Partitions)** where the system behavior is specified to be uniform.
2. Select values at the **Boundaries** of these partitions, as programmers frequently make off-by-one errors at these edges.

```
       Invalid Partition ───┼─── Valid Partition ───┼─── Invalid Partition
                            │                       │
                     [-1]  [0]  [1]           [79] [80] [81]
                      │     │    │             │    │    │
                      ▼     ▼    ▼             ▼    ▼    ▼
                   Outside  On Inside        Inside On Outside
```

### Reference Table: BVA for `Price Ceiling` Filter
| Parameter | Partition | Bounds Check type | Test Value | Expected Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `maxPrice` | Negative Range | Outside Boundary | `-0.01` | Reject input / error state |
| `maxPrice` | Zero | On Boundary | `0.00` | Return only free-to-play games |
| `maxPrice` | Positive Minimum | Inside Boundary | `0.01` | Return games costing ≤ $0.01 |
| `maxPrice` | Max Ceiling | On Boundary | `80.00` | Return games costing ≤ $80.00 |
| `maxPrice` | Out of Slider | Outside Boundary | `80.01` | Clamp value to 80.00 / hide excess |

---

## 3. The Category-Partition Method Worksheet
Designed by Ostrand & Balcer (1988), this systematic approach defines how to go from a specification to test frames.

### Case Study: Simplified `grep <pattern> <filename>`
**Specification**: Search a file for lines matching a pattern. Print matching lines once. Spaces in pattern require single quotes. Quotes in pattern must be escaped `\'`.

| Input Element | Category (Characteristic) | Choices (Partitioned Subdomains) | Constraints / Properties |
| :--- | :--- | :--- | :--- |
| **File** | File Existence | • File exists<br>• File does not exist | <br>`[error]` |
| **File** | File Size | • File is empty<br>• File is not empty | `[property empty_file]` |
| **Pattern** | Pattern Length | • Empty pattern<br>• 1 character<br>• > 1 character | `[property empty_pattern]` |
| **Pattern** | Special Characters | • No special characters<br>• Has whitespace (no quotes)<br>• Has whitespace (enclosed in quotes)<br>• Has quotes (not escaped)<br>• Has quotes (escaped `\'`) | <br>`if not empty_pattern`<br>`if not empty_pattern`<br>`[error]`<br>`if not empty_pattern` |
| **File Content** | Matches in File | • No matches<br>• 1 match in file<br>• Multiple matches in file | `if not empty_file`<br>`if not empty_file`<br>`if not empty_file` |
| **File Content** | Matches per Line | • 1 match per line<br>• Multiple matches per line | `if not empty_file` |

### TSL (Test Specification Language) Constraint Processing
* **No constraints (Raw Cartesian Product)**: $2 \times 2 \times 3 \times 5 \times 3 \times 2 = 720$ combinations.
* **Adding `property-if` constraints**: Eliminates impossible combinations (e.g. pattern matches on an empty file), reducing candidate tests.
* **Adding `[error]` constraints**: If an input is invalid (e.g. file not found), it does not need to be combinatorially tested against all pattern choices. Testing it once is sufficient.
* **Adding `[single]` constraints**: Targets boundary values (e.g. pattern length = maxint) that are important but do not require combination testing.

---

## 4. Model-Based FSM Testing Specifications
When software behavior depends on historical inputs, model the system as a Finite State Machine (FSM):

```
                       ┌───────────────┐
                       │  0. IDLE      │◄──────────────────────────┐
                       └───────┬───────┘                           │
                               │ Request Maintenance               │ Repair Done
                               ▼                                   │
                       ┌───────────────┐                           │
                       │ 1. WAITING    ├────────────────────────┐  │
                       └───────┬───────┘                        │  │
                               │ Pickup                         │  │
                               ▼                                │  │
                       ┌───────────────┐                        │  │
                       │ 2. REPAIR     │                        │  │
                       └───────┬───────┘                        │  │
                               │                                │  │ Cancel
                               │ Fail                           │  │
                               ▼                                │  │
                       ┌───────────────┐                        │  │
                       │ 3. ABANDONED  │◄───────────────────────┴──┘
                       └───────────────┘
```

### FSM State Transition Table
| Current State | Input Event | Target State | Expected Output / Action |
| :--- | :--- | :--- | :--- |
| **0. IDLE** | Request Maintenance | **1. WAITING** | Alert maintenance crew |
| **1. WAITING** | Pickup | **2. REPAIR** | Dispatch technician |
| **1. WAITING** | Cancel | **3. ABANDONED** | Log cancellation |
| **2. REPAIR** | Repair Done | **0. IDLE** | Re-commission system |
| **2. REPAIR** | Fail | **3. ABANDONED** | Sound alarm / log failure |

### FSM Coverage Criteria
* **State Coverage**: Test cases must traverse paths that visit all states: $\{0, 1, 2, 3\}$.
  * *Path 1*: $0 \rightarrow 1 \rightarrow 2 \rightarrow 0$ (covers states $0, 1, 2$).
  * *Path 2*: $0 \rightarrow 1 \rightarrow 3$ (covers states $0, 1, 3$).
* **Transition Coverage**: Test cases must traverse paths exercising every transition arrow.
  * Extends the test cases to cover the $2 \rightarrow 3$ (Repair Fail) transition.
