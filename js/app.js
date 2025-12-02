// simple navigation + query parsing
function navigate(dest){
  // dest could be 'signup?role=doctor' or a file path
  if(typeof dest !== 'string') return;
  if(dest.includes('?')){
    const [page,q] = dest.split('?');
    const params = new URLSearchParams(q);
    const role = params.get('role');
    // redirect to signup/login pages with role set via query
    if(page === 'signup') window.location.href = 'signup.html' + (role ? ('?role='+role) : '');
    else if(page === 'login') window.location.href = 'login.html' + (role ? ('?role='+role) : '');
    return;
  }
  if(dest.endsWith('.html')) window.location.href = dest;
  else window.location.href = dest;
}

// simple logout stub
function logout(){ localStorage.removeItem('doctorcare_user'); alert('Logged out'); window.location.href='index.html' }

// handle populate role on auth pages
(function prefillRole(){
  const url = new URL(window.location.href);
  const role = url.searchParams.get('role');
  if(!role) return;
  const rField = document.getElementById('role') || document.getElementById('loginRole');
  if(rField) rField.value = role;
  // show doctor extra
  const de = document.getElementById('doctorExtra');
  if(role === 'doctor' && de) de.style.display = 'block';
})();

// Mock signup handler
function submitSignup(e){
  e.preventDefault();
  const role = document.getElementById('role')?.value || 'patient';
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const pwd = document.getElementById('password').value;
  const conf = document.getElementById('confirm').value;
  if(pwd !== conf){ alert('Password and confirm must match'); return false; }
  // store in localStorage (mock). DO NOT use this for production passwords.
  const users = JSON.parse(localStorage.getItem('doctorcare_users')||'[]');
  if(users.find(u=>u.email===email)){ alert('User already exists. Please login.'); window.location.href='login.html'; return false; }
  users.push({role,name,email,password:pwd,meta:{degree:document.getElementById('degree')?.value||'',specialization:document.getElementById('specialization')?.value||''}});
  localStorage.setItem('doctorcare_users', JSON.stringify(users));
  alert('Signup successful — logging you in as '+role);
  localStorage.setItem('doctorcare_user', JSON.stringify({email,role,name}));
  if(role==='doctor') window.location.href='doctor-dashboard.html'; else window.location.href='patient-home.html';
  return false;
}

// Mock login handler
function submitLogin(e){
  e.preventDefault();
  const role = document.getElementById('loginRole')?.value || 'patient';
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pwd = document.getElementById('loginPassword').value;
  const users = JSON.parse(localStorage.getItem('doctorcare_users')||'[]');
  const u = users.find(x=>x.email===email && x.password===pwd && (role ? x.role===role : true));
  if(!u){ alert('Invalid credentials.'); return false; }
  localStorage.setItem('doctorcare_user', JSON.stringify({email:u.email,role:u.role,name:u.name}));
  if(u.role==='doctor') window.location.href='doctor-dashboard.html'; else window.location.href='patient-home.html';
  return false;
}

// Small AI consultation stub for doctor dashboard
function startConsult(patientName){
  // This opens a recording-like modal stub (simple prompt) and then generates a mock prescription
  const start = confirm('Start AI consultation recording for ' + patientName + '?');
  if(!start) return;
  // simulate recording & STT
  const transcript = prompt('Simulated transcript (paste notes)\n(For demo paste: "Patient has cough, fever. Prescribe Paracetamol 500mg twice daily for 5 days.")');
  if(!transcript) { alert('No transcript provided, ending'); return; }
  // simulate AI prescription generation
  const generated = aiGeneratePrescription(transcript, patientName);
  // open editor for review
  const edit = confirm('AI generated prescription:\n\n' + generated + '\n\nClick OK to accept and save to records (mock). Cancel to edit.');
  if(edit){
    // store mock EMR entry
    const emr = JSON.parse(localStorage.getItem('doctorcare_emr')||'[]');
    emr.push({patient:patientName,transcript, prescription:generated, date:new Date().toISOString()});
    localStorage.setItem('doctorcare_emr', JSON.stringify(emr));
    alert('Prescription saved to EMR (mock).');
  } else {
    const manual = prompt('Edit prescription (make changes here):', generated);
    if(manual){
      const emr = JSON.parse(localStorage.getItem('doctorcare_emr')||'[]');
      emr.push({patient:patientName,transcript, prescription:manual, date:new Date().toISOString()});
      localStorage.setItem('doctorcare_emr', JSON.stringify(emr));
      alert('Edited prescription saved to EMR (mock).');
    } else alert('No changes saved.');
  }
}

// tiny AI prescription generator (rule-based mock)
function aiGeneratePrescription(transcript, patient){
  // VERY simple extraction: checks for known medicine names and symptoms — placeholder for real AI
  const lower = transcript.toLowerCase();
  const meds = [];
  if(lower.includes('paracetamol') || lower.includes('acetaminophen')) meds.push('Paracetamol 500 mg — 1 tablet twice daily after food for 5 days');
  if(lower.includes('amoxicillin')) meds.push('Amoxicillin 500 mg — 1 capsule thrice daily for 7 days');
  if(lower.includes('cough')) meds.push('Cough syrup (dextromethorphan) — 10 ml at night for 7 days');
  let diagnosis = 'General Consultation';
  if(lower.includes('fever')) diagnosis = 'Fever';
  if(lower.includes('cough')) diagnosis = 'Upper Respiratory Infection';
  const advice = 'Follow up in 5 days if symptoms persist. Stay hydrated.';
  const presc = `Patient: ${patient}\nDate: ${new Date().toLocaleString()}\nDiagnosis: ${diagnosis}\nMedicines:\n- ${meds.length ? meds.join('\n- ') : 'Paracetamol 500 mg — 1 tablet twice daily for 5 days'}\n\nAdvice: ${advice}\n\n(Generated by AI assistant — please review)`;
  return presc;
}
