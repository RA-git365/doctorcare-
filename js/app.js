/* =========================
   DoctorCare Core App JS
   ========================= */

/* ---------- Navigation ---------- */

function navigate(dest){
  if(typeof dest !== 'string') return;

  if(dest.includes('?')){
    const [page,q] = dest.split('?');
    const params = new URLSearchParams(q);
    const role = params.get('role');

    if(page === 'signup'){
      window.location.href = 'signup.html' + (role ? ('?role='+role) : '');
      return;
    }

    if(page === 'login'){
      window.location.href = 'login.html' + (role ? ('?role='+role) : '');
      return;
    }
  }

  window.location.href = dest;
}

/* ---------- Logout ---------- */

function logout(){
  localStorage.removeItem('doctorcare_user');
  alert('Logged out successfully');
  window.location.href = 'index.html';
}

/* ---------- Prefill role on login/signup ---------- */

(function prefillRole(){
  const url = new URL(window.location.href);
  const role = url.searchParams.get('role');

  if(!role) return;

  const rField =
    document.getElementById('role') ||
    document.getElementById('loginRole');

  if(rField) rField.value = role;

  const doctorExtra = document.getElementById('doctorExtra');
  if(role === 'doctor' && doctorExtra){
    doctorExtra.style.display = 'block';
  }

})();

/* ---------- Signup ---------- */

function submitSignup(e){

  e.preventDefault();

  const role = document.getElementById('role')?.value || 'patient';
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const pwd = document.getElementById('password').value;
  const conf = document.getElementById('confirm').value;

  if(pwd !== conf){
    alert('Password and confirm password must match');
    return false;
  }

  const users =
    JSON.parse(localStorage.getItem('doctorcare_users') || '[]');

  if(users.find(u => u.email === email)){
    alert('User already exists. Please login.');
    window.location.href = 'login.html';
    return false;
  }

  const newUser = {
    role,
    name,
    email,
    password: pwd,
    meta:{
      degree: document.getElementById('degree')?.value || '',
      specialization: document.getElementById('specialization')?.value || ''
    }
  };

  users.push(newUser);

  localStorage.setItem(
    'doctorcare_users',
    JSON.stringify(users)
  );

  localStorage.setItem(
    'doctorcare_user',
    JSON.stringify({
      email,
      role,
      name
    })
  );

  alert('Signup successful!');

  if(role === 'doctor'){
    window.location.href = 'doctor-dashboard.html';
  }else{
    window.location.href = 'patient-home.html';
  }

  return false;
}

/* ---------- Login ---------- */

function submitLogin(e){

  e.preventDefault();

  const role = document.getElementById('loginRole')?.value || 'patient';
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pwd = document.getElementById('loginPassword').value;

  const users =
    JSON.parse(localStorage.getItem('doctorcare_users') || '[]');

  const user =
    users.find(
      u => u.email === email &&
      u.password === pwd &&
      u.role === role
    );

  if(!user){
    alert('Invalid credentials');
    return false;
  }

  localStorage.setItem(
    'doctorcare_user',
    JSON.stringify({
      email:user.email,
      role:user.role,
      name:user.name
    })
  );

  if(user.role === 'doctor'){
    window.location.href = 'doctor-dashboard.html';
  }else{
    window.location.href = 'patient-home.html';
  }

  return false;
}

/* ---------- Load Doctor Dashboard ---------- */

(function loadDoctorDashboard(){

  const user =
    JSON.parse(localStorage.getItem('doctorcare_user') || 'null');

  if(!user) return;

  const nameField = document.getElementById('doctorName');

  if(nameField){
    nameField.innerText = user.name;
  }

  const apptCount = document.getElementById('todayAppointments');
  const newPatients = document.getElementById('newPatients');
  const pending = document.getElementById('pendingPrescriptions');

  if(apptCount) apptCount.innerText = "5";
  if(newPatients) newPatients.innerText = "2";
  if(pending) pending.innerText = "3";

})();

/* ---------- AI Consultation ---------- */

function startConsult(patientName){

  const start =
    confirm("Start AI consultation for " + patientName + "?");

  if(!start) return;

  const transcript =
    prompt(
      "Enter consultation notes\nExample:\nPatient has cough and fever"
    );

  if(!transcript){
    alert("No notes entered");
    return;
  }

  const prescription =
    aiGeneratePrescription(transcript, patientName);

  const accept =
    confirm(
      "AI Generated Prescription:\n\n" +
      prescription +
      "\n\nAccept?"
    );

  let finalPrescription = prescription;

  if(!accept){
    const edited =
      prompt(
        "Edit prescription:",
        prescription
      );

    if(edited){
      finalPrescription = edited;
    }
  }

  const emr =
    JSON.parse(localStorage.getItem('doctorcare_emr') || '[]');

  emr.push({
    patient: patientName,
    notes: transcript,
    prescription: finalPrescription,
    date: new Date().toISOString()
  });

  localStorage.setItem(
    'doctorcare_emr',
    JSON.stringify(emr)
  );

  alert("Prescription saved successfully");

}

/* ---------- Simple AI Prescription Engine ---------- */

function aiGeneratePrescription(transcript, patient){

  const lower = transcript.toLowerCase();

  let diagnosis = "General Consultation";
  let medicines = [];

  if(lower.includes("fever")){
    diagnosis = "Fever";
    medicines.push(
      "Paracetamol 500mg – twice daily for 5 days"
    );
  }

  if(lower.includes("cough")){
    diagnosis = "Upper Respiratory Infection";
    medicines.push(
      "Cough Syrup – 10ml at night for 7 days"
    );
  }

  if(lower.includes("infection")){
    medicines.push(
      "Amoxicillin 500mg – three times daily for 7 days"
    );
  }

  if(medicines.length === 0){
    medicines.push(
      "Paracetamol 500mg – twice daily for 5 days"
    );
  }

  const advice =
    "Drink plenty of fluids and follow up if symptoms persist.";

  return `
Patient: ${patient}

Date: ${new Date().toLocaleString()}

Diagnosis: ${diagnosis}

Medicines:
- ${medicines.join("\n- ")}

Advice:
${advice}

(Generated by DoctorCare AI assistant)
`;

}
