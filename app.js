
// دوال التبديل بين واجهة الدخول والتسجيل
function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

// دالة الدخول (حالياً كتطبع رسالة في الكونسول حتى نربطوها بـ Firebase)
function login() {
    const phone = document.getElementById('loginPhone').value;
    const pass = document.getElementById('loginPass').value;
    
    if(!phone || !pass) {
        alert("يرجى ملء جميع الخانات");
        return;
    }
    console.log("جاري محاولة الدخول لـ:", phone);
    alert("تم الضغط على دخول - جاري الربط بـ Firebase");
}

// دالة التسجيل
function register() {
    alert("جاري محاولة التسجيل...");
}

// دالة إظهار المودال
function showCreateGroupModal() {
    document.getElementById('createGroupModal').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}
