import { Request, Response, NextFunction } from "express";

// Validera email-format
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validera lösenord (minst 8 tecken, minst en bokstav och en siffra)
export function validatePassword(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

// Validera namn (endast bokstäver, mellanslag och bindestreck)
export function validateName(name: string): boolean {
  return /^[a-zA-ZåäöÅÄÖ\s-]+$/.test(name) && name.length >= 2 && name.length <= 100;
}

// Validera datum (YYYY-MM-DD format)
export function validateDate(date: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  
  const parsedDate = new Date(date);
  return !isNaN(parsedDate.getTime());
}

// Validera timmar (positivt nummer, max 24)
export function validateHours(hours: number): boolean {
  return typeof hours === 'number' && hours > 0 && hours <= 24;
}

// Validera ID (positivt heltal)
export function validateId(id: any): boolean {
  const numId = parseInt(id);
  return !isNaN(numId) && numId > 0;
}



// Middleware för att validera användarregistrering
export function validateUserRegistration(req: Request, res: Response, next: NextFunction) {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Namn, email och lösenord krävs' });
  }

  if (!validateName(name)) {
    return res.status(400).json({ error: 'Ogiltigt namn. Använd endast bokstäver, mellanslag och bindestreck (2-100 tecken)' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Ogiltigt email-format' });
  }

  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Lösenord måste vara minst 8 tecken med minst en bokstav och en siffra' });
  }

  if (role && !['admin', 'handler', 'supervisor'].includes(role)) {
    return res.status(400).json({ error: 'Ogiltig roll. Tillåtna roller: admin, handler, supervisor' });
  }

  next();
}

// Middleware för att validera kunddata
export function validateCustomerData(req: Request, res: Response, next: NextFunction) {
  const { initials, gender, birthYear, startDate, isGroup } = req.body;

  if (!initials) {
    return res.status(400).json({ error: 'Initialer krävs' });
  }

  const normalizedIsGroup = typeof isGroup === 'string'
    ? isGroup.toLowerCase() === 'true'
    : Boolean(isGroup);
  req.body.isGroup = normalizedIsGroup;

  // Konvertera initialer till versaler automatiskt
  req.body.initials = initials.toString().toUpperCase();

  // Validera att initialerna nu är korrekta
  if (!/^[A-ZÅÄÖ]{1,3}$/.test(req.body.initials)) {
    return res.status(400).json({ error: 'Initialer måste vara 1-3 bokstäver (A-Z, Å, Ä, Ö)' });
  }

  if (normalizedIsGroup) {
    req.body.gender = null;
    req.body.birthYear = null;
  } else {
    if (!gender || !birthYear) {
      return res.status(400).json({ error: 'Initialer, kön och födelseår krävs' });
    }

    if (!['Flicka', 'Pojke', 'Icke-binär'].includes(gender)) {
      return res.status(400).json({ error: 'Kön måste vara Flicka, Pojke eller Icke-binär' });
    }

    const numericBirthYear = Number(birthYear);
    if (!Number.isInteger(numericBirthYear)) {
      return res.status(400).json({ error: 'Födelseår måste vara ett heltal' });
    }

    const currentYear = new Date().getFullYear();
    if (numericBirthYear < 1900 || numericBirthYear > currentYear) {
      return res.status(400).json({ error: 'Ogiltigt födelseår' });
    }

    req.body.gender = gender;
    req.body.birthYear = numericBirthYear;
  }

  if (startDate && !validateDate(startDate)) {
    return res.status(400).json({ error: 'Ogiltigt startdatum' });
  }

  next();
}

// Middleware för att validera tidsregistrering
export function validateShiftData(req: Request, res: Response, next: NextFunction) {
  const { case_id, customer_id, effort_id, handler1_id, handler2_id, date, hours, status } = req.body;

  if (!date || typeof hours === 'undefined' || !status) {
    return res.status(400).json({ error: 'Datum, timmar och status krävs' });
  }

  const hasCaseId = typeof case_id !== 'undefined' && case_id !== null && case_id !== '';

  if (hasCaseId) {
    if (!validateId(case_id)) {
      return res.status(400).json({ error: 'Ogiltigt insats-ID' });
    }
  } else {
    if (!customer_id || !effort_id || !handler1_id) {
      return res.status(400).json({ error: 'Kund, insats och behandlare krävs när insats-ID saknas' });
    }
    if (!validateId(customer_id) || !validateId(effort_id) || !validateId(handler1_id)) {
      return res.status(400).json({ error: 'Ogiltiga ID:n för kund/insats/behandlare' });
    }
    if (handler2_id && handler2_id !== '' && !validateId(handler2_id)) {
      return res.status(400).json({ error: 'Ogiltigt behandlare 2 ID' });
    }
  }

  if (!validateDate(date)) {
    return res.status(400).json({ error: 'Ogiltigt datum. Använd YYYY-MM-DD format' });
  }

  if (!validateHours(hours)) {
    return res.status(400).json({ error: 'Timmar måste vara mellan 0.1 och 24' });
  }

  if (!['Utförd', 'Avbokad'].includes(status)) {
    return res.status(400).json({ error: 'Ogiltig status. Tillåtna: Utförd, Avbokad' });
  }

  next();
}

// Middleware för att validera insatsdata
export function validateCaseData(req: Request, res: Response, next: NextFunction) {
  const { customer_id, effort_id, handler1_id, handler2_id } = req.body;

  if (!customer_id || !effort_id || !handler1_id) {
    return res.status(400).json({ error: 'Kund-ID, insats-ID och behandlare 1 krävs' });
  }

  if (!validateId(customer_id) || !validateId(effort_id) || !validateId(handler1_id)) {
    return res.status(400).json({ error: 'Ogiltiga ID:n. Måste vara positiva heltal' });
  }

  if (handler2_id && !validateId(handler2_id)) {
    return res.status(400).json({ error: 'Ogiltigt behandlare 2 ID' });
  }

  next();
}

// Middleware för att validera sökparametrar
export function validateSearchParams(req: Request, res: Response, next: NextFunction) {
  const { from, to, page, limit } = req.query;

  if (from && !validateDate(from as string)) {
    return res.status(400).json({ error: 'Ogiltigt startdatum' });
  }

  if (to && !validateDate(to as string)) {
    return res.status(400).json({ error: 'Ogiltigt slutdatum' });
  }

  if (from && to && new Date(from as string) > new Date(to as string)) {
    return res.status(400).json({ error: 'Startdatum måste vara före slutdatum' });
  }

  if (page && (!validateId(page) || parseInt(page as string) < 1)) {
    return res.status(400).json({ error: 'Sida måste vara ett positivt heltal' });
  }

  if (limit && (!validateId(limit) || parseInt(limit as string) < 1 || parseInt(limit as string) > 1000)) {
    return res.status(400).json({ error: 'Antal per sida måste vara mellan 1 och 1000' });
  }

  next();
}

// Sanitize input (ta bort skadliga tecken)
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Ta bort < och >
    .replace(/javascript:/gi, '') // Ta bort javascript:
    .replace(/on\w+=/gi, '') // Ta bort event handlers
    .trim();
}

// Middleware för att sanitisera alla text-inputs
export function sanitizeTextInputs(req: Request, res: Response, next: NextFunction) {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeInput(req.body[key]);
      }
    });
  }
  
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeInput(req.query[key] as string);
      }
    });
  }

  next();
}
