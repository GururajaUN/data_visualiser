/* ============================================================
   Tracker — internal data format (single source of truth)
   Edit this file to change sheet names, columns, allowed values
   or business rules. The body between the markers must stay
   valid JSON (it is also read by the template generator).
   ============================================================ */
window.RC = window.RC || {};
RC.SCHEMA = /*JSON-START*/{
  "formatVersion": "1.0",

  "rules": {
    "batchMinStudents": 10,
    "batchMaxStudents": 30,
    "eligibilityAttendancePct": 90,
    "eligibilityInclusive": true,
    "seatsPerBatch": 30
  },

  "files": {
    "master":   { "label": "Master",   "folder": "master",  "pattern": "^(?:[a-z0-9]+_)?master.*\\.xlsx$", "sheets": ["Centres", "JobRoles", "Plan"], "required": true },
    "trainers": { "label": "Trainers", "folder": "master",  "pattern": "^trainers.*\\.xlsx$",      "sheets": ["Trainers"], "required": true },
    "status":   { "label": "Status",   "folder": "status",  "pattern": "^status_(\\d{4}-\\d{2}-\\d{2})\\.xlsx$", "sheets": ["CAAF", "Batches"], "required": true, "dated": true },
    "batch":    { "label": "Batch",    "folder": "batches", "pattern": "^batch_(.+)\\.xlsx$",       "sheets": ["Info", "Students", "Attendance", "Assessment"], "required": false }
  },

  "enums": {
    "Flag":             ["Y", "N"],
    "IDType":           ["Existing ID", "New ID"],
    "TOTStatus":        ["Not Raised", "Requested", "Scheduled", "Completed", "Failed"],
    "InspectionResult": ["Pending", "Pass", "Fail"],
    "BatchStatus":      ["Planned", "Created", "Ongoing", "Completed", "Cancelled"],
    "Gender":           ["Male", "Female", "Other"],
    "StudentStatus":    ["Active", "Dropped"],
    "AttendanceMark":   ["P", "A"],
    "AssessmentResult": ["Pass", "Fail", "Absent"]
  },

  "caafSteps": [
    { "col": "TCCreated",      "label": "TC created",        "stage": "TC Created" },
    { "col": "DocsUploaded",   "label": "Documents uploaded", "stage": null },
    { "col": "OTPVerified",    "label": "OTP verified",       "stage": "Half CAAF" },
    { "col": "PhotosUploaded", "label": "Geo-tagged photos",  "stage": "CAAF Complete" },
    { "col": "InspectionDone", "label": "NSDC inspection",    "stage": "Inspection Complete" }
  ],
  "caafStages": ["Not Started", "TC Created", "Half CAAF", "CAAF Complete", "Inspection Complete"],

  "sheets": {
    "Centres": {
      "key": ["CentreID"],
      "desc": "One row per GTTC centre. Static identity and contact details.",
      "columns": [
        { "name": "CentreID",   "type": "id",    "required": true,  "desc": "Internal ID, e.g. GTTC-01. Never changes." },
        { "name": "CentreName", "type": "text",  "required": true,  "desc": "Short display name, e.g. GTTC Mysore" },
        { "name": "TCID",       "type": "text",                     "desc": "SIDH TC ID once created, else blank" },
        { "name": "District",   "type": "text",  "required": true },
        { "name": "State",      "type": "text" },
        { "name": "Address",    "type": "text" },
        { "name": "SPOCName",   "type": "text" },
        { "name": "SPOCEmail",  "type": "email" },
        { "name": "SPOCMobile", "type": "phone" },
        { "name": "Remarks",    "type": "text" }
      ]
    },
    "JobRoles": {
      "key": ["JobRoleCode"],
      "desc": "The job roles offered under the project.",
      "columns": [
        { "name": "JobRoleCode",   "type": "id",   "required": true, "desc": "Internal short code, e.g. MO-CNC" },
        { "name": "JobRoleName",   "type": "text", "required": true },
        { "name": "ShortName",     "type": "text",                   "desc": "Label used in compact tables" },
        { "name": "QPCode",        "type": "text",                   "desc": "NSQF QP code (fill when known)" },
        { "name": "DurationHours", "type": "int" },
        { "name": "Remarks",       "type": "text" }
      ]
    },
    "Plan": {
      "key": ["CentreID", "JobRoleCode"],
      "desc": "Target allocation per centre x job role.",
      "columns": [
        { "name": "CentreID",       "type": "ref",  "ref": "Centres",  "required": true },
        { "name": "JobRoleCode",    "type": "ref",  "ref": "JobRoles", "required": true },
        { "name": "TargetSeats",    "type": "int",  "required": true },
        { "name": "PlannedBatches", "type": "int",  "required": true },
        { "name": "PlannedStart",   "type": "date" },
        { "name": "PlannedEnd",     "type": "date" },
        { "name": "Remarks",        "type": "text" }
      ]
    },
    "Trainers": {
      "key": ["TrainerID"],
      "desc": "One row per trainer. A trainer belongs to one centre and one job role.",
      "columns": [
        { "name": "TrainerID",        "type": "id",   "required": true, "desc": "Internal ID, e.g. TR-001" },
        { "name": "SIDHTrainerID",    "type": "text" },
        { "name": "TrainerName",      "type": "text", "required": true },
        { "name": "CentreID",         "type": "ref",  "ref": "Centres",  "required": true },
        { "name": "JobRoleCode",      "type": "ref",  "ref": "JobRoles", "required": true },
        { "name": "Mobile",           "type": "phone" },
        { "name": "Email",            "type": "email" },
        { "name": "IDType",           "type": "enum", "enum": "IDType" },
        { "name": "EduCertUploaded",  "type": "enum", "enum": "Flag" },
        { "name": "ExpCertUploaded",  "type": "enum", "enum": "Flag" },
        { "name": "AadhaarVerified",  "type": "enum", "enum": "Flag", "desc": "Status only. Never enter the Aadhaar number." },
        { "name": "OTPVerified",      "type": "enum", "enum": "Flag" },
        { "name": "TOTStatus",        "type": "enum", "enum": "TOTStatus", "required": true },
        { "name": "TOTRequestDate",   "type": "date" },
        { "name": "TOTCompletedDate", "type": "date" },
        { "name": "Remarks",          "type": "text" }
      ]
    },
    "CAAF": {
      "key": ["CentreID"],
      "desc": "Centre onboarding steps. Enter the date each step was done (or Y if date unknown).",
      "columns": [
        { "name": "CentreID",         "type": "ref",      "ref": "Centres", "required": true },
        { "name": "TCCreated",        "type": "dateflag" },
        { "name": "DocsUploaded",     "type": "dateflag" },
        { "name": "OTPVerified",      "type": "dateflag" },
        { "name": "PhotosUploaded",   "type": "dateflag" },
        { "name": "InspectionDone",   "type": "dateflag" },
        { "name": "InspectionResult", "type": "enum", "enum": "InspectionResult" },
        { "name": "Remarks",          "type": "text" }
      ]
    },
    "Batches": {
      "key": ["BatchID"],
      "desc": "One row per batch. CCTV login details are NOT stored here.",
      "columns": [
        { "name": "BatchID",          "type": "id",   "required": true, "desc": "Internal ID: <CentreID>-<JobRoleCode>-B<n>" },
        { "name": "CentreID",         "type": "ref",  "ref": "Centres",  "required": true },
        { "name": "JobRoleCode",      "type": "ref",  "ref": "JobRoles", "required": true },
        { "name": "SIDHBatchID",      "type": "text" },
        { "name": "StartDate",        "type": "date", "required": true },
        { "name": "EndDate",          "type": "date", "required": true },
        { "name": "PrimaryTrainerID", "type": "ref",  "ref": "Trainers" },
        { "name": "BackupTrainerID",  "type": "ref",  "ref": "Trainers" },
        { "name": "CCTVVerified",     "type": "enum", "enum": "Flag" },
        { "name": "CCTVVerifiedDate", "type": "date" },
        { "name": "BatchStatus",      "type": "enum", "enum": "BatchStatus", "required": true },
        { "name": "Remarks",          "type": "text" }
      ]
    },
    "Info": {
      "key": ["BatchID"],
      "desc": "Identifies which batch this file belongs to (one row).",
      "columns": [
        { "name": "BatchID", "type": "ref", "ref": "Batches", "required": true }
      ]
    },
    "Students": {
      "key": ["StudentID"],
      "desc": "One row per student in this batch.",
      "columns": [
        { "name": "StudentID",       "type": "id",   "required": true, "desc": "Internal ID: <BatchID>-S<nn>" },
        { "name": "SIDHCandidateID", "type": "text" },
        { "name": "StudentName",     "type": "text", "required": true },
        { "name": "Gender",          "type": "enum", "enum": "Gender" },
        { "name": "Mobile",          "type": "phone" },
        { "name": "EnrolledDate",    "type": "dateflag" },
        { "name": "JoinedDate",      "type": "dateflag" },
        { "name": "StudentStatus",   "type": "enum", "enum": "StudentStatus", "required": true },
        { "name": "Remarks",         "type": "text" }
      ]
    },
    "Attendance": {
      "key": ["StudentID"],
      "wide": true,
      "desc": "Students as rows, one column per session date (header = date). Mark P or A. Leave blank if no session.",
      "columns": [
        { "name": "StudentID",   "type": "ref",  "ref": "Students", "required": true },
        { "name": "StudentName", "type": "text" }
      ]
    },
    "Assessment": {
      "key": ["StudentID", "Attempt"],
      "desc": "One row per assessment attempt. Add a new row for a retake.",
      "columns": [
        { "name": "StudentID",      "type": "ref",  "ref": "Students", "required": true },
        { "name": "Attempt",        "type": "int",  "required": true },
        { "name": "AssessmentDate", "type": "date" },
        { "name": "Result",         "type": "enum", "enum": "AssessmentResult" },
        { "name": "Score",          "type": "number" },
        { "name": "CertifiedDate",  "type": "date" },
        { "name": "Remarks",        "type": "text" }
      ]
    }
  }
}/*JSON-END*/;
