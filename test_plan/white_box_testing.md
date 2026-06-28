# Comprehensive Test Plan - White-Box Testing

This document serves as the master specification for white-box (structural) testing design. It defines the mathematical and logical criteria for evaluating test suite thoroughness using control-flow, data-flow, and fault-based metrics.

---

## 1. Case Study 1: Statement vs. Branch Coverage (`PrintSum`)
Statement coverage is the most common criterion in industry, but it is weaker than branch coverage.

### Code Under Test
```javascript
function PrintSum(A, B) {
  let result = A + B;       // Statement 1
  print(result);            // Statement 2
  if (result > 0) {         // Statement 3 (Decision 1)
    print("Red");           // Statement 4 (Branch 1 - True)
  }
  if (result < 0) {         // Statement 5 (Decision 2)
    print("Blue");          // Statement 6 (Branch 2 - True)
  }
  return result;            // Statement 7
}
```

### Control Flow Graph (CFG) representation
* **Nodes**: Statements 1 through 7.
* **Edges**: Control flow transfers.
  * Node 3 has two outgoing edges: `result > 0` (to Node 4) and `result <= 0` (falls through to Node 5 - Branch 1 - False).
  * Node 5 has two outgoing edges: `result < 0` (to Node 6) and `result >= 0` (falls through to Node 7 - Branch 2 - False).

### Test Suite 1: Statement Coverage Target (100%)
Let's construct a test suite with 2 test cases:
1. **Test 1**: `A = 3, B = 9` (result = 12).
   * Executes Nodes: 1, 2, 3, 4 (Red branch), 5, 7. (Leaves Node 6 unexecuted).
2. **Test 2**: `A = -5, B = -8` (result = -13).
   * Executes Nodes: 1, 2, 3, 5, 6 (Blue branch), 7.
* **Result**: **100% Statement Coverage** (every node in the CFG was executed).
* **Missing Branch Coverage**: The falls-through branch from Node 3 (Branch 1 - False) and Node 5 (Branch 2 - False) were never explicitly tested! This means if `result == 0`, we have no test coverage for that logic.

### Test Suite 2: Branch Coverage Target (100%)
To achieve 100% branch coverage (exercising all 4 branch edges in the CFG), we must add:
3. **Test 3**: `A = 0, B = 0` (result = 0).
   * Traverses: Node 3 falls through (False) and Node 5 falls through (False) to Node 7.
* **Result**: **100% Branch Coverage** (subsumes statement coverage).

---

## 2. Case Study 2: Branch vs. Condition Coverage (`OR` Predicate)
Branch coverage and condition coverage do not subsume each other; they are incomparable.

### Code Under Test
```javascript
// x and y are real numbers
if (x === 0 || y > 0) {    // Predicate: A || B
  y = y / x;               // True Branch (contains division-by-zero fault if x === 0)
} else {
  x = y + 2;               // False Branch
}
```

### Scenario 1: 100% Branch Coverage misses the bug
Let's design a test suite targeting only branch outcomes:
1. **Test 1**: `x = 5, y = 5` (Predicate evaluates to `False || True = True` -> takes True branch).
2. **Test 2**: `x = 5, y = -5` (Predicate evaluates to `False || False = False` -> takes False branch).
* **Result**: **100% Branch Coverage** is achieved (both branches executed).
* **The Leak**: The division-by-zero fault (`y = y / x` where `x === 0`) was **never revealed** because `x` was never set to 0.

### Scenario 2: 100% Condition Coverage misses the branches
Let's design a test suite targeting only the individual conditions:
* Condition A: `x === 0`
* Condition B: `y > 0`
1. **Test 1**: `x = 0, y = -5` (A is `True`, B is `False`. Predicate: `True || False = True` -> True Branch).
2. **Test 2**: `x = 5, y = 5` (A is `False`, B is `True`. Predicate: `False || True = True` -> True Branch).
* **Result**: **100% Condition Coverage** is achieved (both A and B evaluated to true and false).
* **The Leak**: The `else` branch (False Branch) was **never executed** (overall predicate was always true). Branch coverage is only 50%!

### Solution: 100% Branch & Condition Coverage
To satisfy both, we combine the test sets:
* Test 1: `x = 0, y = -5` (Reveals the division-by-zero failure!)
* Test 2: `x = 5, y = 5`
* Test 3: `x = 3, y = -2` (Takes the `else` branch)

---

## 3. Modified Condition/Decision Coverage (MC/DC)
MC/DC requires that we show each condition can independently affect the decision outcome.

### Predicate under test: `a AND b AND c`
For $n = 3$ conditions, multiple condition coverage requires $2^3 = 8$ tests (combinatorial explosion). MC/DC achieves safety-critical coverage with only $n + 1 = 4$ tests.

| Test Case | a | b | c | Outcome | Pairs Proving Independent Effect |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **#1** | **T** | **T** | **T** | **T** | Base case for True outcome |
| **#2** | **T** | **T** | **F** | **F** | Pair **(#1, #2)** shows condition **c** independently affects outcome. |
| **#3** | **T** | **F** | **T** | **F** | Pair **(#1, #3)** shows condition **b** independently affects outcome. |
| **#4** | T | F | F | F | (Excluded to save cost) |
| **#5** | **F** | **T** | **T** | **F** | Pair **(#1, #5)** shows condition **a** independently affects outcome. |
| **#6** | F | T | F | F | (Excluded to save cost) |
| **#7** | F | F | T | F | (Excluded to save cost) |
| **#8** | F | F | F | F | (Excluded to save cost) |

* **Final MC/DC Test Suite**: `{#1, #2, #3, #5}` (4 tests total).
* **Avionics Standards**: The FAA requires MC/DC coverage for Level A safety-critical aerospace software (DO-178C).

---

## 4. Advanced Structural Verification

### Data-Flow Testing (Def-Use Pairs)
Data-flow testing tracks the lifecycle of variables:
1. **Definition (Def)**: A statement where a variable is written to memory (e.g. `let x = ...`).
2. **Use**: A statement where a variable is read from memory.
   * **C-Use (Computation Use)**: Used in a calculation (e.g. `y = x + 2`).
   * **P-Use (Predicate Use)**: Used in a decision/branch (e.g. `if (x > 0)`).
* **Goal**: Exercise all Def-Use paths in the program to ensure data propagates correctly.

### Mutation Testing (Fault-Based)
Evaluate test suite thoroughness by mutating the code syntax to create **Mutants**:

```
        ┌───────────────────────────────────────────────────────────┐
        │                 Original Program: a > b                   │
        └─────────────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
        ┌───────────────────────────────────────────────────────────┐
        │      Arithmetic Mutation (ROR): Replace > with >=         │
        └─────────────────────────────┬─────────────────────────────┘
                                      │
                                      ▼
        ┌───────────────────────────────────────────────────────────┐
        │                     Mutant Program                        │
        └─────────────────────────────┬─────────────────────────────┘
                                      │
                             Run Existing Test Suite
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
           Tests Still Pass                      Some Test Fails
                   │                                     │
                   ▼                                     ▼
           Mutant SURVIVED                        Mutant KILLED
        (Missing Test Case)                     (Good Test Quality)
```

#### Mutation Score Calculation
The quality of a test suite is measured by the percentage of mutants it kills:
$$Mutation\ Score\ (MS) = \frac{K}{M - D} \times 100\%$$
Where:
* $K$ = Number of **Killed** mutants.
* $M$ = Total number of generated **Mutants**.
* $D$ = Number of **Dead/Infeasible** mutants (mutants that are logically identical to the original program and can never be killed).
