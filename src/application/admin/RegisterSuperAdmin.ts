import { prisma } from "../../infrastructure/database/client";
import { generatePin, getPinExpiryTime, isValidEmail, sendPinToEmail } from "../../domain/utils/auth";

interface RegisterSuperAdminInput {
  email: string;
  name: string;
}

interface RegisterSuperAdminOutput {
  success: boolean;
  adminId?: string;
  message: string;
}

export async function registerSuperAdmin(input: RegisterSuperAdminInput): Promise<RegisterSuperAdminOutput> {
  const { email, name } = input;
  if (!isValidEmail(email)) {
    return { success: false, message: "Invalid email format" };
  }
  if (!name || name.trim().length < 2) {
    return { success: false, message: "Name must be at least 2 characters" };
  }
  const existingAdminCount = await prisma.superAdmin.count();
  if (existingAdminCount > 0) {
    return { success: false, message: "Super admin already registered. Contact system administrator." };
  }
  const pin = generatePin();
  const pinExpiresAt = getPinExpiryTime();
  const admin = await prisma.superAdmin.create({
    data: { email: email.toLowerCase(), name: name.trim(), currentPin: pin, pinExpiresAt, emailVerified: false },
  });
  sendPinToEmail(email, pin, "signup");
  console.log("\n🔐 SUPER ADMIN REGISTERED - EMAIL LOCKED 🔐");
  return { success: true, adminId: admin.id, message: "Super admin registration successful." };
}
