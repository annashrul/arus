import blueprint from '../../firebase-blueprint.json';

type BlueprintProperty = {
  type: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  enum?: readonly string[];
};

const entities = blueprint.entities as Record<
  string,
  {
    properties: Record<string, BlueprintProperty>;
    required?: string[];
  }
>;

export function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

export function isValidBlueprintDate(value: string): boolean {
  const pattern = new RegExp(entities.Athlete.properties.birthDate.pattern || '^\\d{4}-\\d{2}-\\d{2}$');
  return pattern.test(value);
}

export function isValidBlueprintTime(value: string): boolean {
  const pattern = new RegExp(entities.TrainingSchedule.properties.startTime.pattern || '^\\d{2}:\\d{2}$');
  return pattern.test(value);
}

export const LIMITS = {
  club: {
    nameMax: entities.Club.properties.name.maxLength ?? 100,
    cityMax: entities.Club.properties.city.maxLength ?? 60,
    addressMax: entities.Club.properties.address.maxLength ?? 200,
    headCoachMax: entities.Club.properties.headCoach.maxLength ?? 80,
    phoneMax: entities.Club.properties.phone.maxLength ?? 25,
    emailMax: entities.Club.properties.email.maxLength ?? 100,
    bankNameMax: entities.Club.properties.bankName.maxLength ?? 60,
    bankAccountNumberMax: entities.Club.properties.bankAccountNumber.maxLength ?? 40,
    bankAccountHolderMax: entities.Club.properties.bankAccountHolder.maxLength ?? 80,
  },
  athlete: {
    fullNameMax: entities.Athlete.properties.fullName.maxLength ?? 100,
    parentNameMax: entities.Athlete.properties.parentName.maxLength ?? 100,
    parentPhoneMax: entities.Athlete.properties.parentPhone.maxLength ?? 25,
    coachNameMax: entities.Athlete.properties.coachName.maxLength ?? 80,
    notesMax: entities.Athlete.properties.notes.maxLength ?? 400,
  },
  swimTime: {
    athleteNameMax: entities.SwimTime.properties.athleteName.maxLength ?? 100,
    eventNameMax: entities.SwimTime.properties.eventName.maxLength ?? 80,
    formattedTimeMax: entities.SwimTime.properties.formattedTime.maxLength ?? 15,
    championshipNameMax: entities.SwimTime.properties.championshipName.maxLength ?? 120,
    locationMax: entities.SwimTime.properties.location.maxLength ?? 100,
    notesMax: entities.SwimTime.properties.notes.maxLength ?? 300,
  },
  transaction: {
    descriptionMax: entities.Transaction.properties.description.maxLength ?? 200,
    referenceNoMax: entities.Transaction.properties.referenceNo.maxLength ?? 60,
    athleteNameMax: entities.Transaction.properties.athleteName.maxLength ?? 100,
  },
  schedule: {
    titleMax: entities.TrainingSchedule.properties.title.maxLength ?? 120,
    poolLocationMax: entities.TrainingSchedule.properties.poolLocation.maxLength ?? 100,
    laneInfoMax: entities.TrainingSchedule.properties.laneInfo.maxLength ?? 40,
    coachNameMax: entities.TrainingSchedule.properties.coachName.maxLength ?? 80,
    notesMax: entities.TrainingSchedule.properties.notes.maxLength ?? 400,
  },
  invoice: {
    invoiceNumberMax: entities.Invoice.properties.invoiceNumber.maxLength ?? 40,
    periodMonthMax: entities.Invoice.properties.periodMonth.maxLength ?? 30,
    descriptionMax: entities.Invoice.properties.description.maxLength ?? 200,
    notesMax: entities.Invoice.properties.notes.maxLength ?? 300,
  },
  attendance: {
    notesMax: entities.Attendance.properties.notes.maxLength ?? 200,
  },
  announcement: {
    titleMax: entities.Announcement.properties.title.maxLength ?? 140,
    contentMax: entities.Announcement.properties.content.maxLength ?? 2000,
    targetGroupMax: entities.Announcement.properties.targetGroup.maxLength ?? 50,
    authorNameMax: entities.Announcement.properties.authorName.maxLength ?? 80,
  },
};
