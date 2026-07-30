export type Lang = 'he' | 'en';

export type TranslationKey =
  | 'appTitle'
  | 'loginEmailPlaceholder'
  | 'loginPasswordPlaceholder'
  | 'loginButton'
  | 'loginError'
  | 'headerLoggedInAs'
  | 'headerLogoutButton'
  | 'navScan'
  | 'navSearch'
  | 'navDashboard'
  | 'noItems'
  | 'scanInstruction'
  | 'scanLookupError'
  | 'scanRetryButton'
  | 'scanNotFoundTitle'
  | 'scanNotFoundSearchLink'
  | 'scanAgainButton'
  | 'scanConfirmButton'
  | 'scanItemsLabel'
  | 'scanAlreadyPickedUpTitle'
  | 'scanAlreadyPickedUpDetail'
  | 'scanConfirmingButton'
  | 'scanPickedUpTitle'
  | 'scanNextButton'
  | 'scanCameraError'
  | 'searchFieldTicketId'
  | 'searchFieldTransaction'
  | 'searchValuePlaceholder'
  | 'searchButton'
  | 'searchNotePlaceholder'
  | 'searchValidateButton'
  | 'searchValidatedSuffix'
  | 'searchAlreadyPickedUpSuffix'
  | 'searchNotFoundSuffix'
  | 'searchErrorSuffix'
  | 'statusIssued'
  | 'statusValidated'
  | 'statusAll'
  | 'dashboardFilterPlaceholder'
  | 'dashboardValidatedAt'
  | 'dashboardValidatedBy'
  | 'dashboardResendButton'
  | 'dashboardResendSuccess'
  | 'dashboardResendFailure'
  | 'dashboardDetailClose'
  | 'dashboardDetailTicketId'
  | 'dashboardDetailCustomerEmail'
  | 'dashboardDetailCustomerPhone'
  | 'dashboardDetailTransactionCode'
  | 'dashboardDetailPaymentSum'
  | 'dashboardDetailIssuedAt'
  | 'dashboardDetailValidatedAt'
  | 'dashboardDetailValidatedBy'
  | 'dashboardDetailValidationNote'
  | 'dashboardDetailEmailStatus'
  | 'dashboardDetailEmailStatusSent'
  | 'dashboardDetailEmailStatusFailed'
  | 'dashboardDetailInvalidateButton'
  | 'dashboardDetailInvalidateConfirm'
  | 'dashboardDetailInvalidateCancel';

export const translations: Record<Lang, Record<TranslationKey, string>> = {
  en: {
    appTitle: 'Grow Ticketing — Staff',
    loginEmailPlaceholder: 'Email',
    loginPasswordPlaceholder: 'Password',
    loginButton: 'Log in',
    loginError: 'Login failed. Check your credentials.',
    headerLoggedInAs: 'Logged in as {{email}}',
    headerLogoutButton: 'Log out',
    navScan: 'Scan',
    navSearch: 'Search by Trans. Code',
    navDashboard: 'Tickets',
    noItems: 'No items',
    scanInstruction: 'Point camera at ticket QR',
    scanLookupError: "Couldn't check this ticket. Try again.",
    scanRetryButton: 'Try again',
    scanNotFoundTitle: 'Ticket not found',
    scanNotFoundSearchLink: 'Search manually instead',
    scanAgainButton: 'Scan again',
    scanConfirmButton: 'Confirm pickup',
    scanItemsLabel: 'Items: {{items}}',
    scanAlreadyPickedUpTitle: 'Already picked up',
    scanAlreadyPickedUpDetail: 'Validated {{time}} by {{staff}}',
    scanConfirmingButton: 'Confirming…',
    scanPickedUpTitle: 'Picked up',
    scanNextButton: 'Scan next',
    scanCameraError: 'Could not access the camera. Check camera permissions and try again.',
    searchFieldTicketId: 'Ticket ID',
    searchFieldTransaction: 'Transaction code',
    searchValuePlaceholder: 'Search value',
    searchButton: 'Search',
    searchNotePlaceholder: 'Verification note (e.g. verified via ID)',
    searchValidateButton: 'Validate manually',
    searchValidatedSuffix: ' — validated',
    searchAlreadyPickedUpSuffix: ' — already picked up (validated by someone else just now)',
    searchNotFoundSuffix: ' — ticket not found',
    searchErrorSuffix: ' — something went wrong, please try again',
    statusIssued: 'Issued',
    statusValidated: 'Picked up',
    statusAll: 'All',
    dashboardFilterPlaceholder: 'Filter by name, email, or phone',
    dashboardValidatedAt: '(validated {{time}})',
    dashboardValidatedBy: '(validated {{time}} by {{staff}})',
    dashboardResendButton: 'Resend email',
    dashboardResendSuccess: 'Email resent',
    dashboardResendFailure: 'Resend failed — try again',
    dashboardDetailClose: 'Close',
    dashboardDetailTicketId: 'Ticket ID: {{value}}',
    dashboardDetailCustomerEmail: 'Email: {{value}}',
    dashboardDetailCustomerPhone: 'Phone: {{value}}',
    dashboardDetailTransactionCode: 'Transaction code: {{value}}',
    dashboardDetailPaymentSum: 'Payment: {{value}}',
    dashboardDetailIssuedAt: 'Issued: {{value}}',
    dashboardDetailValidatedAt: 'Validated at: {{value}}',
    dashboardDetailValidatedBy: 'Validated by: {{value}}',
    dashboardDetailValidationNote: 'Note: {{value}}',
    dashboardDetailEmailStatus: 'Confirmation email: {{value}}',
    dashboardDetailEmailStatusSent: 'Sent',
    dashboardDetailEmailStatusFailed: 'Failed',
    dashboardDetailInvalidateButton: 'Invalidate ticket',
    dashboardDetailInvalidateConfirm: 'Confirm invalidate',
    dashboardDetailInvalidateCancel: 'Cancel',
  },
  he: {
    appTitle: 'כרטיסי Grow – צוות',
    loginEmailPlaceholder: 'אימייל',
    loginPasswordPlaceholder: 'סיסמה',
    loginButton: 'התחברות',
    loginError: 'ההתחברות נכשלה. בדקו את פרטי ההתחברות.',
    headerLoggedInAs: 'מחוברים כ-{{email}}',
    headerLogoutButton: 'התנתקות',
    navScan: 'סריקה',
    navSearch: 'חיפוש לפי אסמכתא',
    navDashboard: 'כרטיסים',
    noItems: 'אין פריטים',
    scanInstruction: 'כוונו את המצלמה לקוד ה-QR של הכרטיס',
    scanLookupError: 'לא ניתן היה לבדוק את הכרטיס. נסו שוב.',
    scanRetryButton: 'נסו שוב',
    scanNotFoundTitle: 'הכרטיס לא נמצא',
    scanNotFoundSearchLink: 'חיפוש ידני במקום זאת',
    scanAgainButton: 'סרקו שוב',
    scanConfirmButton: 'אישור מסירה',
    scanItemsLabel: 'פריטים: {{items}}',
    scanAlreadyPickedUpTitle: 'כבר נמסר',
    scanAlreadyPickedUpDetail: 'אושר ב-{{time}} על ידי {{staff}}',
    scanConfirmingButton: 'מאשר…',
    scanPickedUpTitle: 'נמסר',
    scanNextButton: 'לסריקה הבאה',
    scanCameraError: 'לא ניתן לגשת למצלמה. בדקו את הרשאות המצלמה ונסו שוב.',
    searchFieldTicketId: 'מזהה כרטיס',
    searchFieldTransaction: 'קוד עסקה',
    searchValuePlaceholder: 'ערך לחיפוש',
    searchButton: 'חיפוש',
    searchNotePlaceholder: 'הערת אימות (למשל: אומת לפי ת.ז.)',
    searchValidateButton: 'אישור ידני',
    searchValidatedSuffix: ' — אושר',
    searchAlreadyPickedUpSuffix: ' — כבר נמסר (אושר על ידי איש צוות אחר הרגע)',
    searchNotFoundSuffix: ' — הכרטיס לא נמצא',
    searchErrorSuffix: ' — משהו השתבש, נסו שוב',
    statusIssued: 'הונפק',
    statusValidated: 'נמסר',
    statusAll: 'הכל',
    dashboardFilterPlaceholder: 'סינון לפי שם, אימייל או טלפון',
    dashboardValidatedAt: '(נמסר ב-{{time}})',
    dashboardValidatedBy: '(נמסר ב-{{time}} על ידי {{staff}})',
    dashboardResendButton: 'שליחה חוזרת של האימייל',
    dashboardResendSuccess: 'האימייל נשלח מחדש',
    dashboardResendFailure: 'השליחה נכשלה — נסו שוב',
    dashboardDetailClose: 'סגירה',
    dashboardDetailTicketId: 'מזהה כרטיס: {{value}}',
    dashboardDetailCustomerEmail: 'אימייל: {{value}}',
    dashboardDetailCustomerPhone: 'טלפון: {{value}}',
    dashboardDetailTransactionCode: 'קוד עסקה: {{value}}',
    dashboardDetailPaymentSum: 'תשלום: {{value}}',
    dashboardDetailIssuedAt: 'הונפק ב-{{value}}',
    dashboardDetailValidatedAt: 'אושר ב-{{value}}',
    dashboardDetailValidatedBy: 'אושר על ידי: {{value}}',
    dashboardDetailValidationNote: 'הערה: {{value}}',
    dashboardDetailEmailStatus: 'אימייל אישור: {{value}}',
    dashboardDetailEmailStatusSent: 'נשלח',
    dashboardDetailEmailStatusFailed: 'נכשל',
    dashboardDetailInvalidateButton: 'ביטול אישור מסירה',
    dashboardDetailInvalidateConfirm: 'אישור הביטול',
    dashboardDetailInvalidateCancel: 'חזרה',
  },
};

const STORAGE_KEY = 'lang';

let currentLang: Lang = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'he';

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
}

export function t(key: TranslationKey, params?: Record<string, string>): string {
  const template = translations[currentLang][key];
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(value),
    template,
  );
}

export function applyDir(): void {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'he' ? 'rtl' : 'ltr';
  document.title = t('appTitle');
}

export function localeTag(): 'he-IL' | 'en-US' {
  return currentLang === 'he' ? 'he-IL' : 'en-US';
}
