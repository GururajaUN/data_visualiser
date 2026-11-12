/* ============================================================
   SIDH export definitions.
   ASSUMED FORMATS: replace headers/order with the real SIDH bulk
   upload templates once available. Only this file should need to
   change when SIDH formats change.

   Each export:
     source  : students | marks | trainers | batches | centres
     filter  : optional predefined filter (see export-sidh.js FILTERS)
     columns : { h: header text, v: field path on the row object,
                 fmt: date | pct | upper (optional), c: constant }
     required: headers that must not be blank (rows flagged otherwise)
   Row objects (paths available):
     students: id, name, Gender, Mobile, SIDHCandidateID, EnrolledDate, JoinedDate,
               StudentStatus, pct, present, marked, eligible, certDate, lastResult,
               batch.*, centre.*, jobRole.*
     marks   : date, mark, student.*, batch.*, centre.*
     trainers: id, name, SIDHTrainerID, Mobile, Email, TOTStatus, ..., centre.*, jobRole.*
     batches : id, SIDHBatchID, StartDate, EndDate, BatchStatus, trainer.*, m.enrolled, centre.*, jobRole.*
     centres : id, name, TCID, District, SPOCName, SPOCMobile, caaf.stage, caaf.result
   ============================================================ */
window.RC = window.RC || {};
RC.SIDH = {
  exports: [
    {
      id: 'candidates', label: 'Candidate enrolment list', source: 'students', filter: 'notDropped',
      desc: 'Students per batch for candidate upload / batch enrolment.',
      columns: [
        { h: 'TC ID', v: 'centre.TCID' }, { h: 'Batch ID', v: 'batch.SIDHBatchID' },
        { h: 'Job Role', v: 'jobRole.name' }, { h: 'QP Code', v: 'jobRole.QPCode' },
        { h: 'Candidate ID', v: 'SIDHCandidateID' }, { h: 'Candidate Name', v: 'name' },
        { h: 'Gender', v: 'Gender' }, { h: 'Mobile Number', v: 'Mobile' },
        { h: 'Enrolment Date', v: 'EnrolledDate', fmt: 'date' }, { h: 'Batch Join Date', v: 'JoinedDate', fmt: 'date' }
      ],
      required: ['TC ID', 'Batch ID', 'Candidate Name', 'Mobile Number']
    },
    {
      id: 'attendance', label: 'Daily attendance', source: 'marks', dated: true,
      desc: 'One row per student per session date. Pick a date or export all.',
      columns: [
        { h: 'TC ID', v: 'centre.TCID' }, { h: 'Batch ID', v: 'batch.SIDHBatchID' },
        { h: 'Candidate ID', v: 'student.SIDHCandidateID' }, { h: 'Candidate Name', v: 'student.name' },
        { h: 'Session Date', v: 'date', fmt: 'date' }, { h: 'Attendance', v: 'markText' }
      ],
      required: ['Batch ID', 'Candidate ID']
    },
    {
      id: 'trainers', label: 'Trainer details', source: 'trainers',
      desc: 'Trainer onboarding and TOT status per centre.',
      columns: [
        { h: 'TC ID', v: 'centre.TCID' }, { h: 'Trainer ID', v: 'SIDHTrainerID' }, { h: 'Trainer Name', v: 'name' },
        { h: 'Job Role', v: 'jobRole.name' }, { h: 'QP Code', v: 'jobRole.QPCode' }, { h: 'Mobile Number', v: 'Mobile' },
        { h: 'Email', v: 'Email' }, { h: 'ID Type', v: 'IDType' }, { h: 'Aadhaar Verified', v: 'AadhaarVerified' },
        { h: 'TOT Status', v: 'TOTStatus' }, { h: 'TOT Completed On', v: 'TOTCompletedDate', fmt: 'date' }
      ],
      required: ['TC ID', 'Trainer Name']
    },
    {
      id: 'batches', label: 'Batch details', source: 'batches', filter: 'notCancelled',
      desc: 'Batch schedule, trainer and CCTV status.',
      columns: [
        { h: 'TC ID', v: 'centre.TCID' }, { h: 'Batch ID', v: 'SIDHBatchID' }, { h: 'Internal Batch ID', v: 'id' },
        { h: 'Job Role', v: 'jobRole.name' }, { h: 'QP Code', v: 'jobRole.QPCode' },
        { h: 'Start Date', v: 'StartDate', fmt: 'date' }, { h: 'End Date', v: 'EndDate', fmt: 'date' },
        { h: 'Trainer ID', v: 'trainer.SIDHTrainerID' }, { h: 'Trainer Name', v: 'trainer.name' },
        { h: 'Enrolled', v: 'm.enrolled' }, { h: 'CCTV Verified', v: 'CCTVVerified' }, { h: 'Status', v: 'BatchStatus' }
      ],
      required: ['TC ID', 'Start Date', 'End Date']
    },
    {
      id: 'eligibility', label: 'Assessment eligibility', source: 'students', filter: 'completedBatch',
      desc: 'Students in completed batches with attendance % and eligibility.',
      columns: [
        { h: 'TC ID', v: 'centre.TCID' }, { h: 'Batch ID', v: 'batch.SIDHBatchID' },
        { h: 'Candidate ID', v: 'SIDHCandidateID' }, { h: 'Candidate Name', v: 'name' },
        { h: 'Sessions Attended', v: 'present' }, { h: 'Sessions Held', v: 'marked' },
        { h: 'Attendance %', v: 'pct', fmt: 'pct' }, { h: 'Eligible', v: 'eligibleText' }
      ],
      required: ['Batch ID', 'Candidate ID']
    },
    {
      id: 'certified', label: 'Certified candidates', source: 'students', filter: 'certified',
      desc: 'Candidates who passed assessment and are certified.',
      columns: [
        { h: 'TC ID', v: 'centre.TCID' }, { h: 'Batch ID', v: 'batch.SIDHBatchID' }, { h: 'Job Role', v: 'jobRole.name' },
        { h: 'Candidate ID', v: 'SIDHCandidateID' }, { h: 'Candidate Name', v: 'name' }, { h: 'Gender', v: 'Gender' },
        { h: 'Certified On', v: 'certDate', fmt: 'date' }
      ],
      required: ['Candidate ID']
    }
  ]
};
