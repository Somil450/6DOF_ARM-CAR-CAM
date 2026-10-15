
import socket
import tkinter as tk
from tkinter import ttk

# ============================================================
# NETWORK SETTINGS
# ============================================================

ARM_IP = "10.116.205.193"
SLIDER_PORT = 4242
COMMAND_PORT = 5005

# ============================================================
# HOME ANGLES - UNCHANGED FOR OTHER SERVOS
# ============================================================

HOME_ANGLES = [146, 180, 46, 124, 119, 157]

# ============================================================
# GRIPPER CALIBRATION - SERVO 5 / CH5
# ============================================================

GRIPPER_CHANNEL = 5

# Start with the previous open position, then calibrate.
GRIPPER_OPEN_ANGLE = 170
GRIPPER_CLOSED_ANGLE = 90

# Move in small increments while calibrating.
GRIPPER_STEP = 5

# ============================================================
# UDP SOCKETS
# ============================================================

slider_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
command_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# ============================================================
# APPLICATION STATE
# ============================================================

slider_controls = []
angle_labels = []
current_angles = HOME_ANGLES.copy()
is_closing = False


# ============================================================
# SEND ALL SIX ANGLES
# ============================================================

def send_angles():
    if is_closing:
        return

    try:
        angles = [int(slider.get()) for slider in slider_controls]

        if len(angles) != 6:
            print("[ERROR] Exactly six servo angles are required.")
            return

        if any(angle < 0 or angle > 180 for angle in angles):
            print("[ERROR] Servo angle must be between 0 and 180.")
            return

        # Protocol preserved: six raw bytes to UDP port 4242.
        packet = bytes(angles)

        slider_socket.sendto(
            packet,
            (ARM_IP, SLIDER_PORT)
        )

        current_angles[:] = angles

        status_label.config(
            text=f"Angles sent: {angles}\nARM: {ARM_IP}"
        )

        print(f"[ANGLES SENT] {angles}")

    except Exception as error:
        print(f"[SEND ERROR] {error}")


# ============================================================
# SLIDER CALLBACK
# ============================================================

def update_angle(index, value):
    try:
        angle = int(float(value))
        angle_labels[index].config(text=f"{angle}°")
        current_angles[index] = angle

        # Preserve existing behaviour: send all six angles.
        send_angles()

    except (ValueError, IndexError):
        pass


# ============================================================
# ARM COMMANDS - UDP PORT 5005
# ============================================================

def send_command(command):
    if is_closing:
        return

    try:
        command_socket.sendto(
            command.strip().upper().encode("utf-8"),
            (ARM_IP, COMMAND_PORT)
        )

        print(f"[COMMAND SENT] {command}")

        status_label.config(
            text=f"Command sent: {command}\nARM: {ARM_IP}"
        )

    except Exception as error:
        print(f"[COMMAND ERROR] {error}")


def send_home():
    send_command("HOME")


def send_stop():
    send_command("STOP")


def pickup_complete():
    send_command("PICKUP_COMPLETE")


# ============================================================
# GRIPPER CALIBRATION
# ============================================================

def set_gripper_angle(angle):
    global GRIPPER_OPEN_ANGLE, GRIPPER_CLOSED_ANGLE

    angle = max(0, min(180, int(angle)))

    # Change only the CH5 slider.
    slider_controls[GRIPPER_CHANNEL].set(angle)

    # Explicitly send the current six-angle packet.
    send_angles()

    status_label.config(
        text=(
            f"Gripper CH5 angle: {angle}°\n"
            "Observe the gripper before adjusting further."
        )
    )


def gripper_open():
    set_gripper_angle(GRIPPER_OPEN_ANGLE)


def gripper_close():
    set_gripper_angle(GRIPPER_CLOSED_ANGLE)


def save_open_angle():
    global GRIPPER_OPEN_ANGLE

    GRIPPER_OPEN_ANGLE = int(
        slider_controls[GRIPPER_CHANNEL].get()
    )

    status_label.config(
        text=f"Gripper OPEN angle set to {GRIPPER_OPEN_ANGLE}°"
    )

    print(f"[CALIBRATION] OPEN = {GRIPPER_OPEN_ANGLE}°")


def save_closed_angle():
    global GRIPPER_CLOSED_ANGLE

    GRIPPER_CLOSED_ANGLE = int(
        slider_controls[GRIPPER_CHANNEL].get()
    )

    status_label.config(
        text=f"Gripper CLOSED angle set to {GRIPPER_CLOSED_ANGLE}°"
    )

    print(f"[CALIBRATION] CLOSED = {GRIPPER_CLOSED_ANGLE}°")


def gripper_step_up():
    angle = int(slider_controls[GRIPPER_CHANNEL].get())
    set_gripper_angle(min(180, angle + GRIPPER_STEP))


def gripper_step_down():
    angle = int(slider_controls[GRIPPER_CHANNEL].get())
    set_gripper_angle(max(0, angle - GRIPPER_STEP))


# ============================================================
# RESET SLIDERS
# ============================================================

def reset_sliders():
    for index, angle in enumerate(HOME_ANGLES):
        slider_controls[index].set(angle)
        angle_labels[index].config(text=f"{angle}°")
        current_angles[index] = angle

    send_angles()
    status_label.config(text="Sliders reset to HOME angles.")


# ============================================================
# CLOSE APPLICATION
# ============================================================

def close_application():
    global is_closing
    is_closing = True

    try:
        command_socket.sendto(
            b"STOP",
            (ARM_IP, COMMAND_PORT)
        )
    except OSError:
        pass

    slider_socket.close()
    command_socket.close()
    root.destroy()


# ============================================================
# GUI
# ============================================================

root = tk.Tk()
root.title("WAREBOT - ARM CONTROL")
root.geometry("760x900")
root.protocol("WM_DELETE_WINDOW", close_application)

main_frame = ttk.Frame(root, padding=15)
main_frame.pack(fill="both", expand=True)

ttk.Label(
    main_frame,
    text="WAREBOT ROBOTIC ARM CONTROL",
    font=("Arial", 16, "bold")
).pack(pady=(0, 8))

ttk.Label(
    main_frame,
    text=(
        f"ARM IP: {ARM_IP}\n"
        f"Slider port: {SLIDER_PORT}\n"
        f"Command port: {COMMAND_PORT}"
    ),
    justify="center"
).pack(pady=(0, 12))


# ============================================================
# SIX SERVO SLIDERS
# ============================================================

for i in range(6):
    row = ttk.Frame(main_frame)
    row.pack(fill="x", pady=5)

    label_text = (
        f"Servo {i} (GRIPPER)"
        if i == GRIPPER_CHANNEL
        else f"Servo {i}"
    )

    ttk.Label(
        row,
        text=label_text,
        width=17
    ).pack(side="left")

    slider = tk.Scale(
        row,
        from_=0,
        to=180,
        orient="horizontal",
        length=400,
        resolution=1,
        showvalue=False,
        command=lambda value, index=i: update_angle(index, value)
    )

    # Set initial position before registering it in the list.
    slider.set(HOME_ANGLES[i])
    slider.pack(side="left")

    angle_label = ttk.Label(
        row,
        text=f"{HOME_ANGLES[i]}°",
        width=7
    )
    angle_label.pack(side="left", padx=8)

    slider_controls.append(slider)
    angle_labels.append(angle_label)


# ============================================================
# GENERAL ARM BUTTONS
# ============================================================

button_frame = ttk.Frame(main_frame)
button_frame.pack(pady=12)

ttk.Button(
    button_frame,
    text="SEND ANGLES",
    command=send_angles
).grid(row=0, column=0, padx=5, pady=5)

ttk.Button(
    button_frame,
    text="HOME",
    command=send_home
).grid(row=0, column=1, padx=5, pady=5)

ttk.Button(
    button_frame,
    text="STOP",
    command=send_stop
).grid(row=0, column=2, padx=5, pady=5)

ttk.Button(
    button_frame,
    text="RESET SLIDERS",
    command=reset_sliders
).grid(row=1, column=0, padx=5, pady=5)

ttk.Button(
    button_frame,
    text="PICKUP COMPLETE",
    command=pickup_complete
).grid(row=1, column=1, padx=5, pady=5)


# ============================================================
# DEDICATED GRIPPER CONTROLS
# ============================================================

ttk.Separator(
    main_frame,
    orient="horizontal"
).pack(fill="x", pady=10)

ttk.Label(
    main_frame,
    text="GRIPPER CALIBRATION - CH5",
    font=("Arial", 12, "bold")
).pack(pady=5)

gripper_frame = ttk.Frame(main_frame)
gripper_frame.pack(pady=5)

ttk.Button(
    gripper_frame,
    text="GRIPPER OPEN",
    command=gripper_open
).grid(row=0, column=0, padx=5, pady=5)

ttk.Button(
    gripper_frame,
    text="GRIPPER CLOSE",
    command=gripper_close
).grid(row=0, column=1, padx=5, pady=5)

ttk.Button(
    gripper_frame,
    text="-5°",
    command=gripper_step_down
).grid(row=1, column=0, padx=5, pady=5)

ttk.Button(
    gripper_frame,
    text="+5°",
    command=gripper_step_up
).grid(row=1, column=1, padx=5, pady=5)

ttk.Button(
    gripper_frame,
    text="SAVE CURRENT AS OPEN",
    command=save_open_angle
).grid(row=2, column=0, padx=5, pady=5)

ttk.Button(
    gripper_frame,
    text="SAVE CURRENT AS CLOSED",
    command=save_closed_angle
).grid(row=2, column=1, padx=5, pady=5)


# ============================================================
# STATUS
# ============================================================

status_label = ttk.Label(
    main_frame,
    text="Ready. Test gripper movement carefully.",
    wraplength=680,
    justify="center"
)
status_label.pack(pady=12)

ttk.Label(
    main_frame,
    text=(
        "Six raw angle bytes -> UDP 4242\n"
        "HOME / STOP / PICKUP_COMPLETE -> UDP 5005\n"
        "Gripper calibration changes CH5 only."
    ),
    justify="center"
).pack(pady=5)


# ============================================================
# START
# ============================================================

print("WAREBOT ARM CONTROL")
print(f"ARM IP: {ARM_IP}")
print(f"Gripper channel: CH{GRIPPER_CHANNEL}")
print(f"Initial gripper open angle: {GRIPPER_OPEN_ANGLE}°")
print(f"Initial gripper closed angle: {GRIPPER_CLOSED_ANGLE}°")

root.mainloop()
