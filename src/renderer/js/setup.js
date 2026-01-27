const { ipcRenderer, shell } = require('electron');

// UI Elements
const supabaseUrlInput = document.getElementById('supabaseUrl');
const supabaseKeyInput = document.getElementById('supabaseKey');
const jitsiDomainInput = document.getElementById('jitsiDomain');
const supabaseError = document.getElementById('supabaseError');

const connectBtn = document.getElementById('connectSupabase');
const toggleKeyBtn = document.getElementById('toggleKey');
const skipJitsiBtn = document.getElementById('skipJitsi');
const saveJitsiBtn = document.getElementById('saveJitsi');
const startAppBtn = document.getElementById('startApp');

const supabaseStep = document.getElementById('supabaseStep');
const jitsiStep = document.getElementById('jitsiStep');
const successStep = document.getElementById('successStep');

const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

// External links
document.getElementById('supabaseLink').addEventListener('click', (e) => {
  e.preventDefault();
  shell.openExternal('https://supabase.com');
});

document.getElementById('docsLink').addEventListener('click', (e) => {
  e.preventDefault();
  shell.openExternal('https://github.com/yourusername/dota-auction-tracker#readme');
});

document.getElementById('helpLink').addEventListener('click', (e) => {
  e.preventDefault();
  shell.openExternal('https://github.com/yourusername/dota-auction-tracker/issues');
});

// Toggle password visibility
toggleKeyBtn.addEventListener('click', () => {
  if (supabaseKeyInput.type === 'password') {
    supabaseKeyInput.type = 'text';
    toggleKeyBtn.textContent = 'Hide';
  } else {
    supabaseKeyInput.type = 'password';
    toggleKeyBtn.textContent = 'Show';
  }
});

// Connect to Supabase
connectBtn.addEventListener('click', async () => {
  const url = supabaseUrlInput.value.trim();
  const key = supabaseKeyInput.value.trim();

  // Validation
  if (!url || !key) {
    showError('Please enter both Supabase URL and API key');
    return;
  }

  if (!url.startsWith('https://')) {
    showError('Supabase URL must start with https://');
    return;
  }

  if (!url.includes('supabase.co') && !url.includes('supabase.')) {
    showError('Please enter a valid Supabase project URL');
    return;
  }

  // Show loading state
  connectBtn.disabled = true;
  connectBtn.innerHTML = '<span class="spinner"></span> Connecting...';
  hideError();

  try {
    const result = await ipcRenderer.invoke('setup-supabase', { url, key });

    if (result.success) {
      // Move to next step
      moveToStep(2);
    } else {
      showError(result.error || 'Failed to connect to Supabase. Please check your credentials.');
      connectBtn.disabled = false;
      connectBtn.innerHTML = '<span class="btn-icon">🔌</span> Connect to Supabase';
    }
  } catch (error) {
    showError('Connection failed: ' + error.message);
    connectBtn.disabled = false;
    connectBtn.innerHTML = '<span class="btn-icon">🔌</span> Connect to Supabase';
  }
});

// Skip Jitsi configuration (use defaults)
skipJitsiBtn.addEventListener('click', () => {
  moveToStep(3);
});

// Save Jitsi configuration
saveJitsiBtn.addEventListener('click', async () => {
  const domain = jitsiDomainInput.value.trim();

  if (!domain) {
    alert('Please enter a Jitsi domain');
    return;
  }

  saveJitsiBtn.disabled = true;
  saveJitsiBtn.innerHTML = '<span class="spinner"></span> Saving...';

  try {
    await ipcRenderer.invoke('set-jitsi-domain', { domain });
    moveToStep(3);
  } catch (error) {
    alert('Failed to save Jitsi configuration: ' + error.message);
    saveJitsiBtn.disabled = false;
    saveJitsiBtn.innerHTML = 'Save Configuration';
  }
});

// Start using the app
startAppBtn.addEventListener('click', () => {
  // The main process will handle loading the main dashboard
  // This is already done after Supabase setup, so this button is just for UI
  console.log('[Setup] Setup complete, main dashboard should be loading');
});

// Helper functions
function moveToStep(stepNumber) {
  // Hide all steps
  supabaseStep.style.display = 'none';
  jitsiStep.style.display = 'none';
  successStep.style.display = 'none';

  // Remove active class from all steps
  step1.classList.remove('active', 'completed');
  step2.classList.remove('active', 'completed');
  step3.classList.remove('active', 'completed');

  // Show and activate current step
  if (stepNumber === 1) {
    supabaseStep.style.display = 'block';
    step1.classList.add('active');
  } else if (stepNumber === 2) {
    jitsiStep.style.display = 'block';
    step1.classList.add('completed');
    step2.classList.add('active');
  } else if (stepNumber === 3) {
    successStep.style.display = 'block';
    step1.classList.add('completed');
    step2.classList.add('completed');
    step3.classList.add('active');
  }
}

function showError(message) {
  supabaseError.textContent = message;
  supabaseError.style.display = 'block';
}

function hideError() {
  supabaseError.style.display = 'none';
}

// Allow Enter key to submit
supabaseUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    connectBtn.click();
  }
});

supabaseKeyInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    connectBtn.click();
  }
});

jitsiDomainInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveJitsiBtn.click();
  }
});