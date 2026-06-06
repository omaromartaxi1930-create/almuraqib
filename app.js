// 1. تبديل واجهة الدخول والتسجيل
function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        document.querySelector('.tab[onclick*="login"]').classList.add('active');
        document.querySelector('.tab[onclick*="register"]').classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        document.querySelector('.tab[onclick*="register"]').classList.add('active');
        document.querySelector('.tab[onclick*="login"]').classList.remove('active');
    }
}

// 2. دالة الدخول (Log In)
function login() {
    const phone = document.getElementById('loginPhone').value;
    const pass = document.getElementById('loginPass').value;
    
    if(!phone || !pass) {
        showToast("يرجى ملء جميع الخانات");
        return;
    }
    
    // هنا غدير الربط بـ Firebase Auth لاحقاً
    console.log("جاري تسجيل الدخول لـ:", phone);
    showToast("جاري الاتصال بالسيرفر...");
}

// 3. دالة التسجيل (Register)
function register() {
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    const pass = document.getElementById('regPass').value;
    const vehicle = document.getElementById('regVehicle').value;

    if (!name || !phone || !pass || !vehicle) {
        showToast("المرجو ملء جميع البيانات");
        return;
    }

    console.log("تسجيل:", name, phone, vehicle);
    showToast("تم إرسال طلب التسجيل!");
}

// 4. دالة عرض الرسائل (Toast)
function showToast(msg) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    toastMsg.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// 5. التحكم في المودالات
function showCreateGroupModal() {
    document.getElementById('createGroupModal').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// 6. تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', () => {
    console.log("المراقب جاهز للعمل!");
});
