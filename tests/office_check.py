# Vérifications croisées du fichier Excel protégé avec des outils de référence :
# msoffcrypto-tool (chiffrement Office), olefile (conteneur) et LibreOffice (ouverture réelle avec mot de passe).
import datetime
import io
import os
import subprocess
import sys
import time


def ref_container(pkg_path, info_path, out_path):
    from msoffcrypto.method.container import ecma376_encrypted as E

    class FixedDT(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.datetime(2026, 11, 14, 12, 0, 0)

    E.datetime = FixedDT
    out = io.BytesIO()
    E.ECMA376Encrypted(open(pkg_path, "rb").read(), open(info_path, "rb").read()).write_to(out)
    open(out_path, "wb").write(out.getvalue())


def decrypt(src, pwd, out_path):
    import msoffcrypto

    f = msoffcrypto.OfficeFile(open(src, "rb"))
    f.load_key(password=pwd, verify_password=True)
    out = io.BytesIO()
    f.decrypt(out, verify_integrity=True)
    open(out_path, "wb").write(out.getvalue())


def encrypt(src, pwd, out_path):
    from msoffcrypto.format.ooxml import OOXMLFile

    f = OOXMLFile(open(src, "rb"))
    out = io.BytesIO()
    f.encrypt(pwd, out)
    open(out_path, "wb").write(out.getvalue())


def ole(src):
    import olefile

    o = olefile.OleFileIO(src, raise_defects=olefile.DEFECT_INCORRECT)
    for e in o.listdir(streams=True, storages=False):
        print("/".join(e), o.get_size("/".join(e)))
    o.close()


def libreoffice(src, pwd):
    import uno
    from com.sun.star.beans import PropertyValue

    pipe = "lo_check_%d" % os.getpid()
    proc = subprocess.Popen(
        ["soffice", "--headless", "--invisible", "--norestore", "--nologo", "-env:UserInstallation=file:///tmp/lo_profile_check", f"--accept=pipe,name={pipe};urp;"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        ctx = None
        for _ in range(60):
            try:
                ctx = resolver.resolve(f"uno:pipe,name={pipe};urp;StarOffice.ComponentContext")
                break
            except Exception:
                time.sleep(0.5)
        if ctx is None:
            print("LIBREOFFICE_INDISPONIBLE")
            return
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)

        def pv(n, v):
            p = PropertyValue()
            p.Name = n
            p.Value = v
            return p

        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(src)), "_blank", 0, (pv("Hidden", True), pv("Password", pwd)))
        if doc is None:
            print("OUVERTURE_IMPOSSIBLE")
            return
        sheets = doc.Sheets
        names = list(sheets.ElementNames)
        print("FEUILLES", ",".join(names))
        s = sheets.getByIndex(0)
        print("A2", s.getCellByPosition(0, 1).String, "B2", s.getCellByPosition(1, 1).String)
        doc.close(True)
    finally:
        try:
            proc.terminate()
            proc.wait(10)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    cmd = sys.argv[1]
    {"ref": lambda: ref_container(*sys.argv[2:5]), "decrypt": lambda: decrypt(*sys.argv[2:5]), "encrypt": lambda: encrypt(*sys.argv[2:5]), "ole": lambda: ole(sys.argv[2]), "libreoffice": lambda: libreoffice(sys.argv[2], sys.argv[3])}[cmd]()
