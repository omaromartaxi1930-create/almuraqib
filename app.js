function switchAuthTab(tab) {
    document.getElementById('loginForm').style.display = (tab === 'login') ? 'block' : 'none';
    document.getElementById('registerForm').style.display = (tab === 'login') ? 'none' : 'block';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active'));
}

function register() {
    const name = document.getElementById('regName').value;
    if(!name) { alert("دخل الاسم!"); return; }
    alert("مرحبا " + name + "، تم التسجيل بنجاح!");
}

function login() {
    alert("جاري الدخول...");
}
