import { z } from 'zod';

// Svenska felmeddelanden
const swedishMessages = {
  required: 'Detta fält är obligatoriskt',
  invalidEmail: 'Ogiltig e-postadress',
  minLength: (min: number) => `Måste vara minst ${min} tecken`,
  maxLength: (max: number) => `Måste vara max ${max} tecken`,
  invalidNumber: 'Måste vara ett giltigt nummer',
  positiveNumber: 'Måste vara ett positivt nummer',
  invalidDate: 'Ogiltigt datum',
  futureDate: 'Datumet får inte vara i framtiden',
  pastDate: 'Datumet får inte vara i det förflutna',
};

// Grundläggande validering
export const requiredString = z.string().min(1, swedishMessages.required);
export const optionalString = z.string().optional();
export const email = z.string().email(swedishMessages.invalidEmail);
export const positiveNumber = z.number().positive(swedishMessages.positiveNumber);
export const nonNegativeNumber = z.number().min(0, 'Måste vara 0 eller större');

// Validering för tidsregistrering
export const timeEntrySchema = z.object({
  caseId: z.number().positive('Välj ett insats'),
  date: z.string().min(1, swedishMessages.required),
  hours: z.number().min(0.5, 'Timmar måste vara minst 0.5').max(24, 'Timmar kan inte vara mer än 24'),
  status: z.enum(['Utförd', 'Avbokad'], {
    message: 'Välj en giltig status'
  }),
});

// Validering för insatsskapande
export const caseSchema = z.object({
  customer_id: z.number().positive('Välj en kund'),
  effort_id: z.number().positive('Välj en insats'),
  handler1_id: z.number().positive('Välj en behandlare'),
  handler2_id: z.number().positive('Välj en behandlare').nullable().optional(),
  active: z.boolean().default(true),
});

// Validering för kund
export const customerSchema = z.object({
  initials: z.string()
    .min(1, swedishMessages.required)
    .max(10, swedishMessages.maxLength(10))
    .regex(/^[A-ZÅÄÖ\s]+$/i, 'Endast bokstäver och mellanslag tillåtna'),
  gender: z.enum(['Kvinna', 'Man', 'Icke-binär'], {
    message: 'Välj kön'
  }),
  birthYear: z.number()
    .int('År måste vara ett heltal')
    .min(1900, 'Födelseår måste vara efter 1900')
    .max(new Date().getFullYear(), 'Födelseår kan inte vara i framtiden'),
  startDate: z.string().optional(),
});

// Validering för användare
export const userSchema = z.object({
  name: z.string()
    .min(2, swedishMessages.minLength(2))
    .max(100, swedishMessages.maxLength(100)),
  email: email,
  password: z.string()
    .min(8, swedishMessages.minLength(8))
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Lösenord måste innehålla små bokstäver, stora bokstäver och siffror'),
  role: z.enum(['admin', 'handler'], {
    message: 'Välj en giltig roll'
  }),
});

// Validering för lösenordsåterställning
const specialCharacters = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?";
const containsSpecialCharacter = (value: string): boolean =>
  specialCharacters.split('').some(char => value.includes(char));

export const passwordResetSchema = z.object({
  password: z.string()
    .min(8, 'Lösenord måste vara minst 8 tecken')
    .regex(/^(?=.*[a-z])/, 'Lösenord måste innehålla minst en liten bokstav')
    .regex(/^(?=.*[A-Z])/, 'Lösenord måste innehålla minst en stor bokstav')
    .regex(/^(?=.*\d)/, 'Lösenord måste innehålla minst en siffra')
    .refine(containsSpecialCharacter, {
      message: 'Lösenord måste innehålla minst ett specialtecken',
      path: ['password']
    }),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Lösenorden matchar inte',
  path: ['confirmPassword'],
});

// Validering för datumintervall
export const dateRangeSchema = z.object({
  from: z.string().min(1, 'Välj startdatum'),
  to: z.string().min(1, 'Välj slutdatum'),
}).refine((data) => {
  const from = new Date(data.from);
  const to = new Date(data.to);
  return from <= to;
}, {
  message: 'Startdatum måste vara före eller samma som slutdatum',
  path: ['to'],
});

// Validering för sökning
export const searchSchema = z.object({
  query: z.string().min(1, 'Ange en sökterm'),
  type: z.enum(['customer', 'case', 'handler', 'effort', 'shift']).optional(),
  limit: z.number().min(1).max(100).default(20),
});

// Utility-funktioner
export const validateForm = <T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } => {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map(err => err.message);
      return { success: false, errors };
    }
    // Logga oväntade fel för debugging
    console.error('❌ Oväntat fel i validateForm:', error);
    if (error instanceof Error) {
      console.error('❌ Felmeddelande:', error.message);
      console.error('❌ Stack trace:', error.stack);
    }
    return { success: false, errors: ['Ett oväntat fel uppstod vid validering'] };
  }
};

// Validera endast ett fält
export const validateField = <T>(schema: z.ZodSchema<T>, value: unknown): { success: true; data: T } | { success: false; error: string } => {
  try {
    const validatedData = schema.parse(value);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || 'Ogiltigt värde' };
    }
    return { success: false, error: 'Ett oväntat fel uppstod vid validering' };
  }
};

// Hook för formulärvalidering
export const useFormValidation = <T>(schema: z.ZodSchema<T>) => {
  const validate = (data: unknown) => validateForm(schema, data);
  const validateFieldValue = (value: unknown) => validateField(schema, value);
  
  return { validate, validateFieldValue };
};

// Exportera alla scheman
export const schemas = {
  timeEntry: timeEntrySchema,
  case: caseSchema,
  customer: customerSchema,
  user: userSchema,
  dateRange: dateRangeSchema,
  search: searchSchema,
  passwordReset: passwordResetSchema,
};
