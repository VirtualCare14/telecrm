import * as XLSX from 'xlsx';

export const EXCEL_COLUMNS = [
  'Organization Name',
  'Contact Person',
  'Phone Number',
  'Email',
  'Address',
  'Lead Source',
  'Please Specify Source',
  'Remarks'
];

export const ALLOWED_LEAD_SOURCES = ['Google', 'Referral', 'Other'];

/**
 * Clean and format phone number from Excel raw value
 */
export function cleanExcelPhone(value) {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  // If Excel parsed as scientific notation or float (e.g. 9.87654321E9)
  if (/^\d+\.?\d*e\+\d+$/i.test(str)) {
    str = Number(value).toFixed(0);
  }
  // Remove decimal point from float representation (e.g. "9876543210.0")
  if (str.endsWith('.0')) {
    str = str.slice(0, -2);
  }
  return str;
}

/**
 * Validate a single parsed Excel row
 */
export function validateLeadRow(rawRow, rowIndex) {
  const errors = [];
  const fieldErrors = {};

  // Extract raw values with trimmed keys
  const orgName = (rawRow['Organization Name'] || rawRow['organization name'] || rawRow['Organization'] || rawRow['Org Name'] || '').toString().trim();
  const contactPerson = (rawRow['Contact Person'] || rawRow['contact person'] || rawRow['Contact Name'] || rawRow['Name'] || rawRow['Primary Contact'] || '').toString().trim();
  const rawPhone = cleanExcelPhone(rawRow['Phone Number'] || rawRow['phone number'] || rawRow['Phone'] || rawRow['Mobile'] || rawRow['Contact Number']);
  const email = (rawRow['Email'] || rawRow['email'] || rawRow['Email Address'] || '').toString().trim();
  const address = (rawRow['Address'] || rawRow['address'] || '').toString().trim();
  const rawLeadSource = (rawRow['Lead Source'] || rawRow['lead source'] || rawRow['Source'] || '').toString().trim();
  const specifySource = (rawRow['Please Specify Source'] || rawRow['please specify source'] || rawRow['Specify Source'] || rawRow['Custom Source'] || '').toString().trim();
  const remarks = (rawRow['Remarks'] || rawRow['remarks'] || rawRow['Notes'] || '').toString().trim();

  // 1. Organization Name validation
  if (!orgName) {
    errors.push('Organization Name is required');
    fieldErrors.organizationName = 'Required';
  }

  // 2. Contact Person validation
  if (!contactPerson) {
    errors.push('Contact Person is required');
    fieldErrors.contactPerson = 'Required';
  }

  // 3. Phone Number validation
  if (!rawPhone) {
    errors.push('Phone Number is required');
    fieldErrors.phone = 'Required';
  } else {
    const digits = rawPhone.replace(/\D/g, '');
    const isValidFormat = /^\+?[0-9\s\-()]{7,20}$/.test(rawPhone) && digits.length >= 7 && digits.length <= 15;
    if (!isValidFormat) {
      errors.push('Phone number must be valid (7-15 digits)');
      fieldErrors.phone = 'Invalid (7-15 digits)';
    }
  }

  // 4. Email validation (optional, but must be valid if provided)
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
      fieldErrors.email = 'Invalid email';
    }
  }

  // 5. Lead Source validation
  let finalLeadSource = '';
  if (!rawLeadSource) {
    errors.push('Lead Source is required (Google, Referral, Other)');
    fieldErrors.leadSource = 'Required';
  } else {
    const matchSource = ALLOWED_LEAD_SOURCES.find(
      (s) => s.toLowerCase() === rawLeadSource.toLowerCase()
    );

    if (!matchSource) {
      errors.push('Lead Source must be Google, Referral, or Other');
      fieldErrors.leadSource = 'Must be Google, Referral, or Other';
    } else if (matchSource === 'Other') {
      if (!specifySource) {
        errors.push('Please Specify Source is required when Lead Source is Other');
        fieldErrors.specifySource = 'Specify Source required for Other';
      } else {
        finalLeadSource = specifySource;
      }
    } else {
      finalLeadSource = matchSource;
    }
  }

  const isValid = errors.length === 0;

  return {
    rowNumber: rowIndex + 1,
    isValid,
    errors,
    fieldErrors,
    display: {
      organizationName: orgName,
      contactPerson,
      phone: rawPhone,
      email,
      address,
      leadSource: rawLeadSource,
      specifySource,
      finalLeadSource,
      remarks,
    },
    payload: isValid ? {
      organizationName: orgName,
      address,
      leadSource: finalLeadSource,
      remarks,
      contacts: [{
        name: contactPerson,
        phone: rawPhone,
        email: email || undefined,
        designation: '',
        altPhone: '',
      }]
    } : null,
  };
}

/**
 * Parse an uploaded Excel file (.xlsx, .xls) and validate rows
 */
export async function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          return reject(new Error('Excel file contains no worksheets.'));
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          return reject(new Error('The uploaded Excel sheet is empty. Please add lead rows to import.'));
        }

        // Validate each row
        const validatedRows = rawRows.map((row, idx) => validateLeadRow(row, idx));

        const validCount = validatedRows.filter((r) => r.isValid).length;
        const invalidCount = validatedRows.filter((r) => !r.isValid).length;

        resolve({
          fileName: file.name,
          sheetName: firstSheetName,
          totalRows: validatedRows.length,
          validCount,
          invalidCount,
          rows: validatedRows,
        });
      } catch (err) {
        reject(new Error(`Failed to parse Excel file: ${err.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the file. Please check file permissions and try again.'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generate and download standard Excel template with exact required columns
 */
export function downloadExcelTemplate() {
  const headers = [
    'Organization Name',
    'Contact Person',
    'Phone Number',
    'Email',
    'Address',
    'Lead Source',
    'Please Specify Source',
    'Remarks'
  ];

  const sampleData = [
    {
      'Organization Name': 'Apex Healthcare Clinic',
      'Contact Person': 'Dr. Rajesh Sharma',
      'Phone Number': '9876543210',
      'Email': 'rajesh@apexhealth.com',
      'Address': '123 MG Road, Mumbai, MH',
      'Lead Source': 'Google',
      'Please Specify Source': '',
      'Remarks': 'Interested in CRM billing and patient scheduling module'
    },
    {
      'Organization Name': 'Care Plus Diagnostic Centre',
      'Contact Person': 'Ananya Verma',
      'Phone Number': '9811223344',
      'Email': 'ananya@careplus.in',
      'Address': 'Sector 18, Noida, UP',
      'Lead Source': 'Referral',
      'Please Specify Source': '',
      'Remarks': 'Referred by Dr. Batra, requested product walkthrough'
    },
    {
      'Organization Name': 'Metro Multispeciality Hospital',
      'Contact Person': 'Vikram Malhotra',
      'Phone Number': '9822334455',
      'Email': 'vikram@metrohospital.org',
      'Address': 'Park Street, Kolkata, WB',
      'Lead Source': 'Other',
      'Please Specify Source': 'Medical Expo 2026',
      'Remarks': 'Met at trade expo, interested in multi-branch setup'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });

  // Set column widths for clean readability in Excel
  worksheet['!cols'] = [
    { wch: 30 }, // Organization Name
    { wch: 22 }, // Contact Person
    { wch: 18 }, // Phone Number
    { wch: 26 }, // Email
    { wch: 30 }, // Address
    { wch: 16 }, // Lead Source
    { wch: 24 }, // Please Specify Source
    { wch: 45 }, // Remarks
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads Template');

  XLSX.writeFile(workbook, 'telecrm_lead_import_template.xlsx');
}
