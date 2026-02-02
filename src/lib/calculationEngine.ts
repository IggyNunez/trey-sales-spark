/**
 * Calculation Engine for Dataset Calculated Fields
 * Supports: math expressions, aggregations, date calculations, and conditionals
 * Time Scopes: all, today, week, month, quarter, year, mtd, ytd, rolling_7d, rolling_30d
 */

import { CalculatedField, FormulaType, TimeScope } from '@/hooks/useCalculatedFields';
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, subDays } from 'date-fns';

// ============= TIME SCOPE FILTERING =============
export function filterRecordsByTimeScope(
  records: Record<string, any>[],
  timeScope: TimeScope,
  dateField: string = 'created_at'
): Record<string, any>[] {
  if (timeScope === 'all') return records;

  const now = new Date();
  let startDate: Date;

  switch (timeScope) {
    case 'today':
      startDate = startOfDay(now);
      break;
    case 'week':
      startDate = startOfWeek(now, { weekStartsOn: 1 });
      break;
    case 'month':
    case 'mtd':
      startDate = startOfMonth(now);
      break;
    case 'quarter':
      startDate = startOfQuarter(now);
      break;
    case 'year':
    case 'ytd':
      startDate = startOfYear(now);
      break;
    case 'rolling_7d':
      startDate = subDays(now, 7);
      break;
    case 'rolling_30d':
      startDate = subDays(now, 30);
      break;
    default:
      return records;
  }

  return records.filter(record => {
    const recordDate = new Date(record[dateField]);
    return !isNaN(recordDate.getTime()) && recordDate >= startDate;
  });
}

// ============= TOKENIZER & PARSER =============
type TokenType = 'NUMBER' | 'STRING' | 'FIELD' | 'OPERATOR' | 'FUNCTION' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'COMPARISON';

interface Token {
  type: TokenType;
  value: string | number;
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < formula.length) {
    const char = formula[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Numbers
    if (/[\d.]/.test(char)) {
      let num = '';
      while (i < formula.length && /[\d.]/.test(formula[i])) {
        num += formula[i++];
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(num) });
      continue;
    }

    // Strings (quoted)
    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      let str = '';
      while (i < formula.length && formula[i] !== quote) {
        str += formula[i++];
      }
      i++; // Skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Operators
    if (['+', '-', '*', '/', '%'].includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char });
      i++;
      continue;
    }

    // Comparisons
    if (['>', '<', '=', '!'].includes(char)) {
      let op = char;
      if (i + 1 < formula.length && formula[i + 1] === '=') {
        op += '=';
        i++;
      }
      tokens.push({ type: 'COMPARISON', value: op });
      i++;
      continue;
    }

    // Parentheses and comma
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      i++;
      continue;
    }

    // Identifiers (field names or functions)
    if (/[a-zA-Z_]/.test(char)) {
      let ident = '';
      while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) {
        ident += formula[i++];
      }
      
      // Check if it's a function (followed by parenthesis)
      const isFunction = formula[i] === '(' && [
        'SUM', 'AVG', 'COUNT', 'MIN', 'MAX',
        'DAYS_SINCE', 'DAYS_BETWEEN', 'MONTHS_SINCE', 'HOURS_SINCE',
        'IF', 'CASE', 'COALESCE', 'ABS', 'ROUND', 'FLOOR', 'CEIL'
      ].includes(ident.toUpperCase());

      tokens.push({ 
        type: isFunction ? 'FUNCTION' : 'FIELD', 
        value: isFunction ? ident.toUpperCase() : ident 
      });
      continue;
    }

    // Skip unknown characters
    i++;
  }

  return tokens;
}

// ============= EXPRESSION EVALUATOR =============
interface EvalContext {
  record: Record<string, any>;
  allRecords?: Record<string, any>[];
  now?: Date;
}

function evaluateExpression(tokens: Token[], ctx: EvalContext): number | string | boolean | null {
  if (tokens.length === 0) return null;

  // Simple expression evaluation (handles basic math)
  const values: (number | string)[] = [];
  const operators: string[] = [];

  const applyOperator = () => {
    if (operators.length === 0 || values.length < 2) return;
    
    const op = operators.pop()!;
    const b = Number(values.pop());
    const a = Number(values.pop());

    let result: number;
    switch (op) {
      case '+': result = a + b; break;
      case '-': result = a - b; break;
      case '*': result = a * b; break;
      case '/': result = b !== 0 ? a / b : 0; break;
      case '%': result = a % b; break;
      default: result = 0;
    }
    values.push(result);
  };

  const precedence: Record<string, number> = {
    '+': 1, '-': 1, '*': 2, '/': 2, '%': 2
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === 'NUMBER') {
      values.push(token.value as number);
    } else if (token.type === 'FIELD') {
      const fieldValue = ctx.record[token.value as string];
      values.push(typeof fieldValue === 'number' ? fieldValue : parseFloat(fieldValue) || 0);
    } else if (token.type === 'OPERATOR') {
      const op = token.value as string;
      while (
        operators.length > 0 &&
        precedence[operators[operators.length - 1]] >= precedence[op]
      ) {
        applyOperator();
      }
      operators.push(op);
    } else if (token.type === 'FUNCTION') {
      // Handle function calls
      const funcName = token.value as string;
      i++; // Skip LPAREN
      
      // Collect arguments
      const args: (number | string)[] = [];
      let depth = 1;
      const argTokens: Token[] = [];
      
      while (i < tokens.length && depth > 0) {
        i++;
        if (tokens[i]?.type === 'LPAREN') depth++;
        else if (tokens[i]?.type === 'RPAREN') depth--;
        else if (tokens[i]?.type === 'COMMA' && depth === 1) {
          // Evaluate current argument
          const argValue = evaluateExpression(argTokens, ctx);
          args.push(argValue as number | string);
          argTokens.length = 0;
        } else if (tokens[i] && depth > 0) {
          argTokens.push(tokens[i]);
        }
      }
      
      // Evaluate last argument
      if (argTokens.length > 0) {
        const argValue = evaluateExpression(argTokens, ctx);
        args.push(argValue as number | string);
      }

      // Execute function
      const result = executeFunction(funcName, args, ctx);
      values.push(result as number);
    }

    i++;
  }

  while (operators.length > 0) {
    applyOperator();
  }

  return values[0] ?? null;
}

// ============= FUNCTION EXECUTION =============
function executeFunction(
  name: string,
  args: (number | string)[],
  ctx: EvalContext
): number | string | boolean | null {
  const now = ctx.now || new Date();

  switch (name) {
    // Math functions
    case 'ABS':
      return Math.abs(Number(args[0]) || 0);
    case 'ROUND':
      return Math.round(Number(args[0]) || 0);
    case 'FLOOR':
      return Math.floor(Number(args[0]) || 0);
    case 'CEIL':
      return Math.ceil(Number(args[0]) || 0);
    case 'COALESCE':
      return args.find(a => a != null && a !== '') ?? null;

    // Date functions
    case 'DAYS_SINCE': {
      const dateStr = String(args[0]);
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    }
    case 'DAYS_BETWEEN': {
      const date1 = new Date(String(args[0]));
      const date2 = new Date(String(args[1]));
      if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return null;
      return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
    }
    case 'MONTHS_SINCE': {
      const dateStr = String(args[0]);
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      const months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
      return months;
    }
    case 'HOURS_SINCE': {
      const dateStr = String(args[0]);
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    }

    // Conditional
    case 'IF': {
      const condition = Boolean(args[0]);
      return condition ? args[1] : args[2];
    }

    // Aggregations (require allRecords context)
    case 'SUM': {
      if (!ctx.allRecords) return Number(args[0]) || 0;
      const fieldName = String(args[0]);
      return ctx.allRecords.reduce((sum, rec) => sum + (Number(rec[fieldName]) || 0), 0);
    }
    case 'AVG': {
      if (!ctx.allRecords || ctx.allRecords.length === 0) return 0;
      const fieldName = String(args[0]);
      const sum = ctx.allRecords.reduce((s, rec) => s + (Number(rec[fieldName]) || 0), 0);
      return sum / ctx.allRecords.length;
    }
    case 'COUNT': {
      if (!ctx.allRecords) return 1;
      if (args[0] === '*') return ctx.allRecords.length;
      // Count with condition would need more parsing
      return ctx.allRecords.length;
    }
    case 'MIN': {
      if (!ctx.allRecords) return Number(args[0]) || 0;
      const fieldName = String(args[0]);
      const values = ctx.allRecords.map(rec => Number(rec[fieldName]) || 0);
      return values.length > 0 ? Math.min(...values) : 0;
    }
    case 'MAX': {
      if (!ctx.allRecords) return Number(args[0]) || 0;
      const fieldName = String(args[0]);
      const values = ctx.allRecords.map(rec => Number(rec[fieldName]) || 0);
      return values.length > 0 ? Math.max(...values) : 0;
    }

    default:
      console.warn(`Unknown function: ${name}`);
      return null;
  }
}

// ============= PUBLIC API =============

/**
 * Calculate a single field value for a record
 */
export function calculateFieldValue(
  field: CalculatedField,
  record: Record<string, any>,
  allRecords?: Record<string, any>[]
): number | string | boolean | null {
  try {
    const tokens = tokenize(field.formula);
    const ctx: EvalContext = {
      record,
      allRecords,
      now: new Date(),
    };

    return evaluateExpression(tokens, ctx);
  } catch (err) {
    console.error(`Error calculating field ${field.field_slug}:`, err);
    return null;
  }
}

/**
 * Calculate all calculated fields for a record
 */
export function calculateAllFields(
  fields: CalculatedField[],
  record: Record<string, any>,
  allRecords?: Record<string, any>[]
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const field of fields) {
    if (!field.is_active) continue;
    result[field.field_slug] = calculateFieldValue(field, record, allRecords);
  }

  return result;
}

/**
 * Calculate aggregations over all records with time scope filtering
 */
export function calculateAggregations(
  fields: CalculatedField[],
  records: Record<string, any>[],
  dateField: string = 'created_at'
): Record<string, number | string | null> {
  const result: Record<string, number | string | null> = {};

  const aggregationFields = fields.filter(f => f.formula_type === 'aggregation' && f.is_active);

  for (const field of aggregationFields) {
    try {
      // Apply time scope filtering
      const filteredRecords = filterRecordsByTimeScope(
        records,
        field.time_scope as TimeScope,
        dateField
      );

      const tokens = tokenize(field.formula);
      const ctx: EvalContext = {
        record: {},
        allRecords: filteredRecords,
        now: new Date(),
      };
      result[field.field_slug] = evaluateExpression(tokens, ctx) as number | string | null;
    } catch (err) {
      console.error(`Error calculating aggregation ${field.field_slug}:`, err);
      result[field.field_slug] = null;
    }
  }

  return result;
}

/**
 * Calculate all field types (expressions, aggregations, etc.) for display
 */
export function calculateAllFieldsWithAggregations(
  calculatedFields: CalculatedField[],
  record: Record<string, any>,
  allRecords: Record<string, any>[],
  dateField: string = 'created_at'
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const field of calculatedFields) {
    if (!field.is_active) continue;

    try {
      if (field.formula_type === 'aggregation') {
        // Apply time scope filtering for aggregations
        const filteredRecords = filterRecordsByTimeScope(
          allRecords,
          field.time_scope as TimeScope,
          dateField
        );

        const tokens = tokenize(field.formula);
        const ctx: EvalContext = {
          record: {},
          allRecords: filteredRecords,
          now: new Date(),
        };
        result[field.field_slug] = evaluateExpression(tokens, ctx);
      } else {
        // For expressions, conditionals, date_diff - evaluate per record
        result[field.field_slug] = calculateFieldValue(field, record, allRecords);
      }
    } catch (err) {
      console.error(`Error calculating field ${field.field_slug}:`, err);
      result[field.field_slug] = null;
    }
  }

  return result;
}

// ============= CIRCULAR DEPENDENCY DETECTION =============

/**
 * Extract field references from a formula
 */
function extractFieldReferences(formula: string): string[] {
  const tokens = tokenize(formula);
  return tokens
    .filter(t => t.type === 'FIELD')
    .map(t => String(t.value));
}

/**
 * Detect circular dependencies in calculated fields
 * Returns: { hasCircular: boolean; cycle?: string[] }
 */
export function detectCircularDependency(
  fields: CalculatedField[],
  newField?: { field_slug: string; formula: string }
): { hasCircular: boolean; cycle?: string[] } {
  // Build dependency graph
  const graph = new Map<string, string[]>();
  
  for (const field of fields) {
    const refs = extractFieldReferences(field.formula);
    graph.set(field.field_slug, refs);
  }
  
  // Add new field if provided
  if (newField) {
    const refs = extractFieldReferences(newField.formula);
    graph.set(newField.field_slug, refs);
  }

  // DFS for cycle detection
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    if (recStack.has(node)) {
      // Found cycle - extract the cycle path
      const cycleStart = path.indexOf(node);
      const cycle = cycleStart >= 0 ? [...path.slice(cycleStart), node] : [node];
      return true;
    }
    
    if (visited.has(node)) return false;
    
    visited.add(node);
    recStack.add(node);
    path.push(node);
    
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      // Only check dependencies that are calculated fields
      if (graph.has(neighbor) && dfs(neighbor)) {
        return true;
      }
    }
    
    path.pop();
    recStack.delete(node);
    return false;
  }

  // Check all nodes
  for (const node of graph.keys()) {
    if (dfs(node)) {
      const cycleStart = path.indexOf(path[path.length - 1] || '');
      const cycle = cycleStart >= 0 ? path.slice(cycleStart) : path;
      return { hasCircular: true, cycle };
    }
    visited.clear();
    recStack.clear();
    path.length = 0;
  }

  return { hasCircular: false };
}

/**
 * Validate a formula syntax
 */
export function validateFormula(
  formula: string, 
  formulaType: FormulaType,
  existingFields?: CalculatedField[],
  currentFieldSlug?: string
): { valid: boolean; error?: string } {
  try {
    const tokens = tokenize(formula);
    
    if (tokens.length === 0) {
      return { valid: false, error: 'Formula is empty' };
    }

    // Check for balanced parentheses
    let parenCount = 0;
    for (const token of tokens) {
      if (token.type === 'LPAREN') parenCount++;
      if (token.type === 'RPAREN') parenCount--;
      if (parenCount < 0) {
        return { valid: false, error: 'Unbalanced parentheses' };
      }
    }
    if (parenCount !== 0) {
      return { valid: false, error: 'Unbalanced parentheses' };
    }

    // Type-specific validation
    if (formulaType === 'aggregation') {
      const hasAggFunc = tokens.some(t => 
        t.type === 'FUNCTION' && ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].includes(String(t.value))
      );
      if (!hasAggFunc) {
        return { valid: false, error: 'Aggregation formula must include SUM, AVG, COUNT, MIN, or MAX' };
      }
    }

    if (formulaType === 'date_diff') {
      const hasDateFunc = tokens.some(t => 
        t.type === 'FUNCTION' && ['DAYS_SINCE', 'DAYS_BETWEEN', 'MONTHS_SINCE', 'HOURS_SINCE'].includes(String(t.value))
      );
      if (!hasDateFunc) {
        return { valid: false, error: 'Date formula must include a date function (DAYS_SINCE, DAYS_BETWEEN, etc.)' };
      }
    }

    // Check for circular dependencies if existing fields provided
    if (existingFields && currentFieldSlug) {
      const fieldsWithoutCurrent = existingFields.filter(f => f.field_slug !== currentFieldSlug);
      const circularCheck = detectCircularDependency(fieldsWithoutCurrent, {
        field_slug: currentFieldSlug,
        formula
      });
      
      if (circularCheck.hasCircular) {
        const cycleStr = circularCheck.cycle?.join(' → ') || 'unknown';
        return { valid: false, error: `Circular dependency detected: ${cycleStr}` };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}
