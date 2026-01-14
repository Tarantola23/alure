from __future__ import annotations

import tkinter as tk
from tkinter import messagebox

from .client import AlureClient


def activate_with_ui(client: AlureClient) -> None:
    root = tk.Tk()
    root.title("Alure Activation")
    root.geometry("360x220")

    tk.Label(root, text="License key").pack(anchor="w", padx=12, pady=(12, 2))
    license_entry = tk.Entry(root, width=40)
    license_entry.pack(padx=12)

    tk.Label(root, text="Device ID").pack(anchor="w", padx=12, pady=(12, 2))
    device_entry = tk.Entry(root, width=40)
    device_entry.pack(padx=12)

    def on_activate() -> None:
        license_key = license_entry.get().strip()
        device_id = device_entry.get().strip()
        if not license_key or not device_id:
            messagebox.showerror("Error", "Please enter license key and device ID.")
            return
        try:
            result = client.activate(license_key, device_id)
            messagebox.showinfo("Activated", f"Activation ID: {result.activation_id}")
            root.destroy()
        except Exception as exc:
            messagebox.showerror("Activation failed", str(exc))

    tk.Button(root, text="Activate", command=on_activate).pack(pady=16)
    root.mainloop()
